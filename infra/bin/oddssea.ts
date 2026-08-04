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

// A fully concrete environment. The account is pinned in config rather than
// read from the shell's credentials — that is what lets credential-free CI
// synthesise using the cached lookups in cdk.context.json, and what makes a
// deploy with credentials for the wrong account fail instead of proceeding.
const env: cdk.Environment = {
  account: config.account,
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
