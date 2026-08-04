import * as fs from 'node:fs';
import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import { AppConfig } from './config';
import { Web } from './constructs/web';

export interface AppStackProps extends cdk.StackProps {
  config: AppConfig;
}

const WEB_DIST = path.join(__dirname, '../../web/dist');

/**
 * The application stack. Increment A: static hosting plus the deployment
 * that fills it. Cognito arrives in Increment B, the API in Increment C —
 * both as additions to this stack, not rewrites.
 */
export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const { config } = props;

    if (!fs.existsSync(WEB_DIST)) {
      throw new Error(
        `No frontend build found at ${WEB_DIST}.\n` +
          'The stack deploys the built site, so it must exist before synth.\n' +
          'Run `npm run build` from the repo root (or `npm run deploy`, which does both).',
      );
    }

    const web = new Web(this, 'Web', { config });

    /**
     * Upload the built site — in two parts, deliberately.
     *
     * Vite names its JS/CSS with a content hash (index-Ab3xK9.js), so a given
     * filename can never hold different bytes: safe to cache forever. But
     * index.html and config.json keep the same names forever, so they must
     * always be revalidated. `cacheControl` applies per BucketDeployment,
     * hence two of them.
     *
     * NEITHER prunes, and the order is pinned (root depends on assets).
     * Pruning would create a window where the live index.html references
     * deleted files; ordering guarantees new assets exist in S3 before the
     * index.html that names them goes live. Superseded assets accumulate —
     * a few hundred KB per deploy, accepted for atomicity. Do not add an
     * age-based lifecycle rule to "clean up": object age tracks upload time,
     * not whether the live HTML still references the file, so a quiet month
     * would expire the assets currently in production.
     */
    const assetsDeployment = new s3deploy.BucketDeployment(this, 'DeployAssets', {
      destinationBucket: web.bucket,
      destinationKeyPrefix: 'assets',
      sources: [s3deploy.Source.asset(path.join(WEB_DIST, 'assets'))],
      prune: false,
      cacheControl: [
        s3deploy.CacheControl.fromString('public, max-age=31536000, immutable'),
      ],
    });

    const rootDeployment = new s3deploy.BucketDeployment(this, 'DeployRoot', {
      destinationBucket: web.bucket,
      sources: [
        // Everything in dist/ except the hashed assets handled above.
        s3deploy.Source.asset(WEB_DIST, { exclude: ['assets', 'assets/**'] }),
        /**
         * Runtime configuration, written at DEPLOY time. Values that only
         * exist once CloudFormation has created them (Cognito IDs, the API
         * URL — from Increment B on) reach the browser through this file
         * rather than being baked into the build. One build artifact
         * therefore works in any environment.
         */
        s3deploy.Source.jsonData('config.json', {
          environment: config.envName,
          region: this.region,
        }),
      ],
      prune: false,
      cacheControl: [s3deploy.CacheControl.fromString('no-cache')],
      // Wipe the CDN cache for the unhashed files so a deploy is visible
      // immediately, not after the cache TTL expires.
      distribution: web.distribution,
      distributionPaths: ['/index.html', '/config.json'],
    });

    // The ordering half of the atomicity story: assets first, then the HTML
    // that references them.
    rootDeployment.node.addDependency(assetsDeployment);

    // ---- Outputs -------------------------------------------------------
    // Printed after every `cdk deploy`; readable any time with:
    //   aws cloudformation describe-stacks --stack-name Oddssea-dev-App

    new cdk.CfnOutput(this, 'AppUrl', {
      value: web.appUrl,
      description: 'Open this in a browser',
    });
    new cdk.CfnOutput(this, 'SiteBucket', { value: web.bucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionId', {
      value: web.distribution.distributionId,
    });
  }
}
