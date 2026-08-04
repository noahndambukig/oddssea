#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { getConfig } from '../lib/config';
import { AppStack } from '../lib/app-stack';
import { CicdStack } from '../lib/cicd-stack';

const app = new cdk.App();

// Which environment to synthesise. Override with: cdk deploy -c env=prod
const envName: string = app.node.tryGetContext('env') ?? 'dev';
const config = getConfig(envName);

// The certificate-region guard (see lib/config.ts). Fails at synth, loudly,
// instead of half-deploying and stalling on certificate validation.
if (config.domainName && config.region !== 'us-east-1') {
  throw new Error(
    `Environment "${envName}" sets a custom domain but region is ` +
      `${config.region}. CloudFront certificates must be issued in ` +
      'us-east-1 — either keep the stack there, or split the certificate ' +
      'into its own us-east-1 stack before moving.',
  );
}

// CDK needs a concrete account+region to look up the Route53 hosted zone.
// Account comes from whatever credentials your shell holds; region from config.
const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: config.region,
};

/**
 * Deployed ONCE, by hand, before CI/CD can work. Creates the trust
 * relationship that lets GitHub Actions obtain temporary AWS credentials
 * with nothing stored in GitHub.
 */
new CicdStack(app, `Oddssea-${config.envName}-Cicd`, {
  env,
  config,
  description: 'GitHub Actions OIDC trust and deploy role (deployed manually, once)',
});

/**
 * The application. This is what CI/CD redeploys on every merge to main.
 */
new AppStack(app, `Oddssea-${config.envName}-App`, {
  env,
  config,
  description: 'oddssea application: static site behind CloudFront',
});

// Stamped onto every resource both stacks create — visible in the console
// and usable for cost breakdowns later.
cdk.Tags.of(app).add('project', 'oddssea');
cdk.Tags.of(app).add('environment', config.envName);
cdk.Tags.of(app).add('managed-by', 'cdk');
