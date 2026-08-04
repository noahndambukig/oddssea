import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';
import { AppConfig, appHostname } from '../config';

export interface WebProps {
  config: AppConfig;
}

/**
 * Static site hosting: a private S3 bucket fronted by CloudFront.
 *
 * The bucket is NOT a public website bucket. It blocks all public access and
 * CloudFront reaches it through Origin Access Control (OAC) — signed requests
 * only CloudFront can make. The only path to the files is through the CDN:
 * no accidental plain-HTTP serving, no S3 bill from traffic that bypasses
 * the cache.
 */
export class Web extends Construct {
  readonly bucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;

  /** The origin the browser loads the app from, e.g. https://oddssea.xyz */
  readonly appUrl: string;

  /**
   * The A record for the canonical hostname — the apex, since the app
   * serves from oddssea.xyz itself. Exposed because Cognito's custom auth
   * domain requires the PARENT domain (the apex) to resolve at creation
   * time, and CloudFormation cannot see that prerequisite — the Auth
   * construct takes this and declares the dependency explicitly.
   */
  readonly apexRecord?: route53.ARecord;

  constructor(scope: Construct, id: string, props: WebProps) {
    super(scope, id);

    const { config } = props;
    const hostname = appHostname(config);

    this.bucket = new s3.Bucket(this, 'Bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // dev-only convenience: lets `cdk destroy` clean up fully. Flip both
      // to RETAIN before anything irreplaceable lives in this bucket.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Created only when the custom domain is configured; until then the
    // distribution serves from its generated *.cloudfront.net name, which
    // has HTTPS out of the box.
    let certificate: acm.ICertificate | undefined;
    let hostedZone: route53.IHostedZone | undefined;

    if (config.domainName && hostname) {
      // Looks up an EXISTING hosted zone — CDK does not create it. If synth
      // fails here, the zone does not exist in this account yet (or the
      // shell has no AWS credentials for the lookup).
      hostedZone = route53.HostedZone.fromLookup(this, 'Zone', {
        domainName: config.domainName,
      });

      certificate = new acm.Certificate(this, 'Certificate', {
        domainName: hostname,
        // DNS validation: ACM asks for a specific CNAME record to be
        // published as proof of domain control. Because the zone is in this
        // account, CDK writes that record itself and the certificate
        // validates — and renews — without manual steps. This is the payoff
        // of delegating DNS to Route53.
        validation: acm.CertificateValidation.fromDns(hostedZone),
      });
    }

    /**
     * Canonical-origin redirect, evaluated at the edge on every request.
     *
     * The distribution answers on its generated *.cloudfront.net hostname
     * as well as the canonical oddssea.xyz — alternate domain names never
     * disable the generated one. Serving the app there would break logins
     * started from it (OAuth callbacks are registered for the canonical
     * origin only), so any non-canonical host bounces. 302 keeps the
     * arrangement revisable without fighting browser redirect caches.
     */
    const redirectFunction =
      hostname !== undefined
        ? new cloudfront.Function(this, 'CanonicalRedirect', {
            runtime: cloudfront.FunctionRuntime.JS_2_0,
            comment: `Redirect every non-canonical host to ${hostname}`,
            code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var host = request.headers.host.value;
  if (host !== '${hostname}') {
    var qs = '';
    var keys = Object.keys(request.querystring);
    for (var i = 0; i < keys.length; i++) {
      qs += (qs ? '&' : '?') + keys[i] + '=' + request.querystring[keys[i]].value;
    }
    return {
      statusCode: 302,
      statusDescription: 'Found',
      headers: { location: { value: 'https://${hostname}' + request.uri + qs } },
    };
  }
  return request;
}`),
          })
        : undefined;

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        // Respects per-object Cache-Control headers, which the deployment
        // sets deliberately: hashed assets are immutable, index.html and
        // config.json revalidate. See app-stack.ts.
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        functionAssociations: redirectFunction
          ? [
              {
                function: redirectFunction,
                eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
              },
            ]
          : undefined,
      },
      domainNames: hostname ? [hostname] : undefined,
      certificate,
      // Cheapest tier: North America + Europe edges only.
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      // Single-page-app routing. Later increments own paths like /callback,
      // but S3 has no object at that key and returns an error; rewriting to
      // index.html hands the URL to the app instead. 403 is included because
      // OAC-fronted S3 answers "no such key" with 403, not 404.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    if (hostedZone && hostname) {
      // The canonical record — the zone apex itself, pointing at
      // CloudFront. Alias is a Route53-specific record type: it resolves
      // like an A record from the outside but points internally at an AWS
      // resource, works at the zone apex where a CNAME cannot, and costs
      // nothing to query. Because this IS the apex, it also satisfies
      // Cognito's parent-must-resolve check for auth.oddssea.xyz — see the
      // apexRecord property doc above.
      this.apexRecord = new route53.ARecord(this, 'AliasRecord', {
        zone: hostedZone,
        recordName: config.subdomain,
        target: route53.RecordTarget.fromAlias(
          new targets.CloudFrontTarget(this.distribution),
        ),
      });
    }

    this.appUrl = hostname
      ? `https://${hostname}`
      : `https://${this.distribution.distributionDomainName}`;
  }
}
