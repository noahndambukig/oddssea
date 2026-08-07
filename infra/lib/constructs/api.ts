import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct, IDependable, DependencyGroup } from 'constructs';
import { AppConfig } from '../config';

export interface ApiProps {
  config: AppConfig;
  /** The database. Reached over the Data API — the Lambda never enters a VPC. */
  cluster: rds.IDatabaseCluster;
  /** The restricted `oddssea_app` role's credentials. NEVER the admin secret. */
  appSecret: secretsmanager.ISecret;
  /** Cognito's hosted domain, for the BFF's token and revoke calls. */
  cognitoDomain: string;
  /** The confidential BFF client — has a secret, so a browser cannot use it. */
  bffClientId: string;
  bffClientSecret: secretsmanager.ISecret;
  /**
   * The site's origin, for CORS. Comes from the Web construct rather than
   * config because, domainless, the site lives on the generated
   * *.cloudfront.net hostname that only the distribution knows — the same
   * reason app-stack passes appUrl to Auth for callback URLs.
   */
  appUrl: string;
  /** The user pool's issuer URL — where the authorizer fetches JWKS from. */
  issuerUrl: string;
  /** The app client ID — the audience a token must have been minted for. */
  userPoolClientId: string;
}

/**
 * The API: one Lambda behind an API Gateway HTTP API, with the JWT
 * verification done BY THE GATEWAY.
 *
 * This is the piece that closes the milestone's loop: a token minted by
 * Cognito, verified by something that is not Cognito, gating something that
 * is not the login page. The verification is offline — API Gateway holds the
 * pool's public keys (fetched from the issuer's JWKS URL) and checks the
 * signature, issuer, audience, expiry and scope itself. No call to Cognito
 * happens per request, which is also why a rejected request costs nothing:
 * no Lambda runs, nothing is invoked, the 401 is generated at the front
 * door. The flip side of offline verification: nothing checks whether a
 * token was revoked after minting, so an access token stays accepted until
 * its expiry (≤1h). That trade — revocation immediacy for zero-latency
 * auth — is inherent to stateless JWTs, and the walkthrough teaches it.
 */
export class Api extends Construct {
  /** The URL the browser calls — custom domain when configured. */
  readonly apiUrl: string;

  /** The generated execute-api URL — always exists, used by the curl check. */
  readonly rawEndpoint: string;

  /**
   * Everything a published API panel needs to actually work. The panel's
   * URL in config.json is a computed string, not a CloudFormation
   * reference, so nothing orders the site upload after the API on its own
   * — same disease as Auth's login URL, same cure. The group holds the
   * SERVING resources (routes + default stage), not just the naming ones:
   * an ApiMapping references the API and stage but never the routes, so
   * without them here the site could publish against an API that resolves
   * but serves {"message":"Not Found"}.
   */
  readonly ready: IDependable;

  constructor(scope: Construct, id: string, props: ApiProps) {
    super(scope, id);

    const {
      config,
      appUrl,
      issuerUrl,
      userPoolClientId,
      cluster,
      appSecret,
      cognitoDomain,
      bffClientId,
      bffClientSecret,
    } = props;
    const readyGroup = new DependencyGroup();

    // Finite retention, same reasoning as the deploy-log group: an explicit
    // LogGroup involves no helper Lambda, where the logRetention prop would
    // deploy one whose own logs retain forever.
    const logGroup = new logs.LogGroup(this, 'HandlerLogs', {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // TypeScript in, bundled JS out — esbuild (an infra devDependency, so
    // bundling never silently falls back to Docker) transpiles
    // api/src/handler.ts at synth time. The Lambda ships only what the
    // handler imports.
    const handler = new NodejsFunction(this, 'Handler', {
      entry: path.join(__dirname, '../../../api/src/handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      logGroup,
      // 25s, under the HTTP API's ~29s integration cap (which is NOT
      // increasable — the 2024 change covers Regional REST APIs only). The
      // default is 3 seconds, which a resuming cluster blows through
      // instantly. The wrapper's resume budget sits below this so the
      // handler can still write a 503; a Lambda that dies of timeout
      // returns a 502 the client cannot interpret.
      timeout: cdk.Duration.seconds(25),
      memorySize: 512,
      environment: {
        CLUSTER_ARN: cluster.clusterArn,
        APP_SECRET_ARN: appSecret.secretArn,
        DATABASE_NAME: 'oddssea',
        COGNITO_DOMAIN: cognitoDomain,
        BFF_CLIENT_ID: bffClientId,
        // The ARN, not the value — see api/src/bff/index.ts.
        BFF_CLIENT_SECRET_ARN: bffClientSecret.secretArn,
        APP_URL: appUrl,
      },
    });

    /**
     * Database access, granted EXPLICITLY — never `cluster.grantDataApiAccess()`.
     *
     * That helper ends with `this.secret?.grantRead(grantee)`, so it also
     * hands over the cluster's MASTER secret. This Lambda could then connect
     * as the admin role and bypass `oddssea_app` entirely: the SECURITY
     * DEFINER functions, the append-only grants, the credential-table
     * lockout — all of it decorative, with nothing failing to reveal it.
     *
     * So: the Data API actions on the cluster, and read on the APP secret
     * only. The convenience method is reserved for the migration Lambda,
     * which legitimately needs admin.
     */
    handler.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'DataApiOnCluster',
        actions: [
          'rds-data:ExecuteStatement',
          'rds-data:BatchExecuteStatement',
          'rds-data:BeginTransaction',
          'rds-data:CommitTransaction',
          'rds-data:RollbackTransaction',
        ],
        resources: [cluster.clusterArn],
      }),
    );
    appSecret.grantRead(handler);
    bffClientSecret.grantRead(handler);

    /**
     * CORS, spelled out. The browser only lets a cross-origin page read a
     * response if these headers permit it, and `Authorization` is not a
     * CORS-safelisted header — so /me triggers a preflight OPTIONS that
     * API Gateway answers itself (OPTIONS is deliberately NOT in
     * allowMethods; the gateway owns the preflight).
     *
     * One documented sharp edge: the gateway adds these headers to
     * INTEGRATION responses only. Its own authorizer-generated 401/403
     * carries no CORS headers, so browser JS sees those as a fetch
     * TypeError, not a status — expected, taught in the walkthrough, and
     * why the numeric rejection checks live in curl.
     */
    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `oddssea-${config.envName}`,
      corsPreflight: {
        allowOrigins: [appUrl, 'http://localhost:5173'],
        // POST is required by every economic route; without it the
        // preflight fails and the browser never sends the real request.
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST],
        allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
        allowCredentials: true,
        // Response headers are safelisted unless exposed. Retry-After is not
        // on that list, so without this the retry client cannot read the
        // cold-start delay the 503 exists to communicate.
        exposeHeaders: ['Retry-After'],
      },
    });

    /**
     * The JWT authorizer — the third leg of the scope loop. The scope is
     * (1) enabled on the app client, (2) requested at authorize time by
     * the browser, and (3) required here. Leg 3 is what actually rejects
     * an ID token sent where an access token belongs: ID tokens carry no
     * `scope` claim at all, so they fail this check (403 — valid identity,
     * insufficient scope) even though their signature, issuer and audience
     * all pass.
     */
    const authorizer = new HttpJwtAuthorizer('JwtAuthorizer', issuerUrl, {
      jwtAudience: [userPoolClientId],
    });

    const integration = new HttpLambdaIntegration('HandlerIntegration', handler);

    // Public — deliberately no authorizer, so "the API is up" and "your
    // token works" are separately observable facts.
    const healthRoutes = httpApi.addRoutes({
      path: '/health',
      methods: [apigwv2.HttpMethod.GET],
      integration,
    });

    /**
     * The BFF. NO AUTHORIZER, deliberately — these routes are how a browser
     * obtains a token in the first place, so requiring one would be circular.
     * They authenticate with cookies and the confidential client secret
     * instead, and CloudFront routes /auth/* here from the app's own origin
     * so the session cookie is first-party.
     */
    const authRoutes = httpApi.addRoutes({
      path: '/auth/{proxy+}',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration,
    });

    const meRoutes = httpApi.addRoutes({
      path: '/me',
      methods: [apigwv2.HttpMethod.GET],
      integration,
      authorizer,
      authorizationScopes: ['openid'],
    });

    // Attestation and the economic routes. Same authorizer and scope as
    // /me; the compliance and balance rules are enforced inside the SQL
    // functions, which is what makes them true regardless of client.
    const attestRoutes = httpApi.addRoutes({
      path: '/me/attest',
      methods: [apigwv2.HttpMethod.POST],
      integration,
      authorizer,
      authorizationScopes: ['openid'],
    });

    const taskRoutes = httpApi.addRoutes({
      path: '/tasks/{proxy+}',
      methods: [apigwv2.HttpMethod.POST],
      integration,
      authorizer,
      authorizationScopes: ['openid'],
    });

    const betRoutes = httpApi.addRoutes({
      path: '/bets/{proxy+}',
      methods: [apigwv2.HttpMethod.POST],
      integration,
      authorizer,
      authorizationScopes: ['openid'],
    });

    const crateRoutes = httpApi.addRoutes({
      path: '/crates/{proxy+}',
      methods: [apigwv2.HttpMethod.POST],
      integration,
      authorizer,
      authorizationScopes: ['openid'],
    });

    const collectionRoutes = httpApi.addRoutes({
      path: '/collection',
      methods: [apigwv2.HttpMethod.GET],
      integration,
      authorizer,
      authorizationScopes: ['openid'],
    });

    // The serving resources. The routes' own references pull the
    // integration, authorizer and Lambda permission along transitively;
    // the default stage is a sibling of all of them and, domainless, the
    // only thing standing between "routes exist" and "the endpoint
    // actually serves".
    for (const route of [
      ...healthRoutes,
      ...authRoutes,
      ...meRoutes,
      ...attestRoutes,
      ...taskRoutes,
      ...betRoutes,
      ...crateRoutes,
      ...collectionRoutes,
    ]) {
      readyGroup.add(route);
    }
    if (httpApi.defaultStage) {
      readyGroup.add(httpApi.defaultStage);
    }

    this.rawEndpoint = httpApi.apiEndpoint;

    if (config.domainName) {
      const apiHostname = `${config.apiSubdomain}.${config.domainName}`;

      const zone = route53.HostedZone.fromLookup(this, 'Zone', {
        domainName: config.domainName,
      });

      // A dedicated certificate rather than a SAN on an existing one:
      // changing a certificate's name list REPLACES it, which would churn
      // the resources already using it. Regional API custom domains need
      // the cert in the API's own region — us-east-1, same as everything.
      const certificate = new acm.Certificate(this, 'ApiCertificate', {
        domainName: apiHostname,
        validation: acm.CertificateValidation.fromDns(zone),
      });

      // The custom domain is three resources, each doing one job:
      // DomainName provisions the TLS endpoint, ApiMapping binds this API
      // to it, and the alias record makes the name resolve to it.
      const domain = new apigwv2.DomainName(this, 'Domain', {
        domainName: apiHostname,
        certificate,
      });

      const mapping = new apigwv2.ApiMapping(this, 'Mapping', {
        api: httpApi,
        domainName: domain,
      });

      const aliasRecord = new route53.ARecord(this, 'ApiAliasRecord', {
        zone,
        recordName: config.apiSubdomain,
        target: route53.RecordTarget.fromAlias(
          new targets.ApiGatewayv2DomainProperties(
            domain.regionalDomainName,
            domain.regionalHostedZoneId,
          ),
        ),
      });

      readyGroup.add(domain);
      readyGroup.add(mapping);
      readyGroup.add(aliasRecord);

      this.apiUrl = `https://${apiHostname}`;
    } else {
      // No custom domain configured — the generated endpoint IS the API
      // URL, and everything above simply does not exist.
      this.apiUrl = this.rawEndpoint;
    }

    this.ready = readyGroup;
  }
}
