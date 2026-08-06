import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { Construct, IDependable, DependencyGroup } from 'constructs';
import { AppConfig } from '../config';

export interface AuthProps {
  config: AppConfig;
  /** Where Cognito may send the user back after login/logout. */
  appUrl: string;
  /**
   * The apex A record from the Web construct. Cognito refuses to create a
   * custom auth domain unless the PARENT domain resolves, and
   * CloudFormation cannot see that prerequisite — no reference connects
   * the two resources — so the dependency is declared by hand here.
   */
  apexRecord?: route53.ARecord;
}

/**
 * Cognito user pool, hosted login pages on auth.oddssea.xyz, and the app
 * client the browser talks to.
 *
 * A "user pool" is a user directory: accounts, passwords, email
 * verification, password reset. Cognito hosts the login/signup screens for
 * it — the part we do NOT build. The part we DO build is the OAuth exchange
 * that turns a successful login into tokens: web/src/auth/.
 */
export class Auth extends Construct {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  /** The confidential client the BFF uses; the authorizer's audience. */
  readonly bffClient: cognito.UserPoolClient;
  readonly bffClientSecret: secretsmanager.Secret;

  /** Base URL of the login pages, e.g. https://auth.oddssea.xyz */
  readonly loginBaseUrl: string;

  /**
   * Everything login needs to actually work: domain, branding, DNS alias.
   * The site upload depends on this, so the app never publishes a Sign In
   * button pointing at infrastructure that does not exist yet. (The login
   * URL in config.json is a computed string, not a CloudFormation
   * reference, so without this the orderings are unrelated.)
   */
  readonly ready: IDependable;

  constructor(scope: Construct, id: string, props: AuthProps) {
    super(scope, id);

    const { config, appUrl, apexRecord } = props;
    const readyGroup = new DependencyGroup();

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `oddssea-${config.envName}`,
      // "Essentials" is what unlocks Managed Login (the brandable hosted
      // pages). Free to 10k monthly active users, then $0.015/MAU — the
      // legacy tier's 50k-free headroom, traded for brandability, with
      // eyes open.
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      customAttributes: {
        // The 18+ attestation timestamp — docs/06-risks/compliance.md
        // requires attestation from day one, and docs/04-technical/
        // data-model.md expects it on the players record. Until the
        // database exists this Cognito attribute is its interim home;
        // it migrates to the players table with the ledger milestone.
        // Written by the client via UpdateUserAttributes — honest, because
        // attestation IS self-declaration.
        age_attested_at: new cognito.StringAttribute({ mutable: true }),
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      // RETAIN, from the ledger milestone onward. The database is SNAPSHOT
      // and players are keyed by the Cognito sub, so a DESTROY pool would
      // leave a perfectly preserved ledger permanently detached from every
      // user who owned it. Durability is a property of the whole system.
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    let domain: cognito.UserPoolDomain;

    if (config.domainName) {
      const authHostname = `${config.authSubdomain}.${config.domainName}`;

      const zone = route53.HostedZone.fromLookup(this, 'Zone', {
        domainName: config.domainName,
      });

      // Same certificate pattern as the site: DNS-validated in the zone
      // this stack controls, so issuance and renewal are hands-off.
      const certificate = new acm.Certificate(this, 'AuthCertificate', {
        domainName: authHostname,
        validation: acm.CertificateValidation.fromDns(zone),
      });

      domain = this.userPool.addDomain('Domain', {
        customDomain: { domainName: authHostname, certificate },
      });

      // Managed Login (the brandable pages) versus the legacy classic
      // Hosted UI. The L2 construct in our aws-cdk-lib has no property for
      // this — verified against the installed typings — so it is set on
      // the underlying CloudFormation resource directly ("L1 escape
      // hatch"). 2 = Managed Login, 1 = classic.
      const cfnDomain = domain.node.defaultChild as cognito.CfnUserPoolDomain;
      cfnDomain.managedLoginVersion = 2;

      // Invisible-prerequisite race (a): Cognito verifies the parent
      // domain resolves at creation time. No CFN reference connects the
      // domain to the apex record, so the ordering is declared manually.
      if (apexRecord) {
        domain.node.addDependency(apexRecord);
      }

      // Cognito's custom domain runs on a CloudFront distribution AWS
      // manages. This alias points auth.oddssea.xyz at it — resolved
      // directly from the domain's attributes (no helper Lambda; the
      // feature flag in cdk.json opts into that path).
      const aliasRecord = new route53.ARecord(this, 'AuthAliasRecord', {
        zone,
        recordName: config.authSubdomain,
        target: route53.RecordTarget.fromAlias(new targets.UserPoolDomainTarget(domain)),
      });

      this.loginBaseUrl = `https://${authHostname}`;
      readyGroup.add(aliasRecord);
    } else {
      // No custom domain configured — fall back to the shared Cognito
      // domain with a globally-unique prefix.
      domain = this.userPool.addDomain('Domain', {
        cognitoDomain: { domainPrefix: config.cognitoDomainPrefix },
      });
      (domain.node.defaultChild as cognito.CfnUserPoolDomain).managedLoginVersion = 2;
      this.loginBaseUrl = `https://${config.cognitoDomainPrefix}.auth.${cdk.Stack.of(this).region}.amazoncognito.com`;
    }

    this.userPoolClient = this.userPool.addClient('WebClient', {
      userPoolClientName: `oddssea-${config.envName}-web`,

      // NO CLIENT SECRET — deliberate, and the reason PKCE exists.
      // Anything shipped to a browser can be read in devtools, so a secret
      // there is not a secret. Cognito calls this a "public client".
      generateSecret: false,

      authFlows: {
        // Everything goes through the hosted pages + OAuth code flow; the
        // direct username/password APIs stay off.
        userPassword: false,
        userSrp: false,
        adminUserPassword: false,
        custom: false,
      },

      oAuth: {
        flows: {
          // The browser receives a one-time CODE, then exchanges it for
          // tokens in a separate POST — see web/src/auth/auth-client.ts.
          authorizationCodeGrant: true,
          // Implicit grant returns tokens in the URL itself, where they
          // land in history and logs. Deprecated by OAuth 2.1. Never
          // enable.
          implicitCodeGrant: false,
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
          // aws.cognito.signin.user.admin — the reserved scope that lets
          // an access token call the self-service user APIs. The 18+
          // attestation write (UpdateUserAttributes) fails at runtime
          // without it. Scopes come from what the authorize request asks
          // for, so web/src/auth requests this too.
          cognito.OAuthScope.COGNITO_ADMIN,
        ],
        // Exact-string matching. An unlisted redirect target is refused,
        // which is what stops a stolen login flow from delivering the
        // code to an attacker's site.
        callbackUrls: [`${appUrl}/callback`, 'http://localhost:5173/callback'],
        logoutUrls: [appUrl, 'http://localhost:5173'],
      },

      // The same generic error whether or not an account exists, so the
      // login form cannot be used to enumerate who has registered.
      preventUserExistenceErrors: true,
      // Lets logout actually invalidate the refresh token server-side.
      enableTokenRevocation: true,

      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      // One day, not the 30-day default — docs/decisions/0017: tokens live
      // in sessionStorage until a backend-for-frontend lands, and a short
      // refresh lifetime bounds what a stolen copy is worth.
      refreshTokenValidity: cdk.Duration.days(1),
    });

    /**
     * The BFF client — CONFIDENTIAL, and that is the whole point.
     *
     * A backend-for-frontend runs on a server, so it can hold a real client
     * secret. That is both the correct OAuth configuration and a structural
     * guarantee: a browser cannot use this client at all, because it cannot
     * have the secret.
     *
     * It also does the rollout work. The JWT authorizer's audience switches
     * to THIS client, so the one-day refresh tokens still sitting in open
     * tabs' sessionStorage stop working the moment this deploys — an
     * audience check rather than a waiting period.
     *
     * The old public client above stays until nothing references it, then
     * gets removed in its own change.
     */
    this.bffClient = this.userPool.addClient('BffClient', {
      userPoolClientName: `oddssea-${config.envName}-bff`,
      generateSecret: true,
      authFlows: {
        userPassword: false,
        userSrp: false,
        adminUserPassword: false,
        custom: false,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true, implicitCodeGrant: false },
        // No COGNITO_ADMIN here: attestation now writes to Postgres through
        // POST /me/attest, so the access token no longer needs to call
        // Cognito's self-service user APIs at all.
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        // COMPLETE callback URIs, matched by Cognito as whole strings — an
        // origin would simply be rejected.
        callbackUrls: [`${appUrl}/auth/callback`, 'http://localhost:5173/auth/callback'],
        logoutUrls: [appUrl, 'http://localhost:5173'],
      },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      // Now that the refresh token lives in an httpOnly cookie rather than
      // sessionStorage, the one-day limit imposed by 0017 has served its
      // purpose. Kept at one day for this milestone anyway: changing two
      // things at once makes a regression impossible to attribute.
      refreshTokenValidity: cdk.Duration.days(1),
    });

    /**
     * The client secret, so the API Lambda can read it at runtime.
     *
     * `userPoolClientSecret` is a CDK-resolved token, not a literal in the
     * template, so it never appears in plaintext in CloudFormation.
     */
    this.bffClientSecret = new secretsmanager.Secret(this, 'BffClientSecret', {
      description: 'oddssea BFF Cognito client secret',
      secretStringValue: this.bffClient.userPoolClientSecret,
    });

    /**
     * Managed Login requires a branding "style" to exist for the client or
     * the login page errors. This creates one holding Cognito's defaults;
     * the actual design happens once, visually, in the console's branding
     * designer — a documented exception to infra-as-code, because a visual
     * tool is the right authoring surface for visual design.
     * CloudFormation will not revert console edits unless this resource
     * itself changes.
     */
    const branding = new cognito.CfnManagedLoginBranding(this, 'Branding', {
      userPoolId: this.userPool.userPoolId,
      clientId: this.userPoolClient.userPoolClientId,
      useCognitoProvidedValues: true,
    });
    // Invisible-prerequisite race (b): the branding style needs Managed
    // Login enabled, which the domain is what enables.
    branding.node.addDependency(domain);

    /**
     * The SAME requirement for the BFF client — and it is PER CLIENT.
     *
     * Adding the BFF client without this produced exactly the error
     * Increment B documented: "Login pages unavailable. Please contact an
     * administrator." The failure mode was already in the walkthrough's
     * table; what was missing was noticing that creating a *new* client
     * re-triggers it. A per-resource requirement is easy to satisfy once
     * and then forget is a requirement at all.
     */
    const bffBranding = new cognito.CfnManagedLoginBranding(this, 'BffBranding', {
      userPoolId: this.userPool.userPoolId,
      clientId: this.bffClient.userPoolClientId,
      useCognitoProvidedValues: true,
    });
    bffBranding.node.addDependency(domain);

    readyGroup.add(domain);
    readyGroup.add(branding);
    readyGroup.add(bffBranding);
    this.ready = readyGroup;
  }

  /**
   * OpenID Connect issuer URL. Increment C's API will fetch
   * <issuer>/.well-known/jwks.json — Cognito's public signing keys — to
   * verify tokens without ever calling Cognito.
   */
  get issuerUrl(): string {
    return `https://cognito-idp.${cdk.Stack.of(this).region}.amazonaws.com/${this.userPool.userPoolId}`;
  }
}
