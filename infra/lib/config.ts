/**
 * Per-environment configuration.
 *
 * This is the only file you should need to edit to point the stacks at your
 * own account and domain. Everything else derives from it.
 */

export interface AppConfig {
  /** Short environment name. Becomes part of every stack and resource name. */
  envName: string;

  /**
   * The AWS account ID the stacks deploy into — pinned explicitly rather
   * than derived from the shell's credentials, for two reasons: it lets
   * credential-free CI read the cached hosted-zone lookup (the cache key in
   * cdk.context.json includes account+region, so an env-agnostic stack
   * cannot consult it), and it makes a deploy against the wrong account
   * fail loudly instead of proceeding. Account IDs are not secrets — they
   * appear in every ARN.
   */
  account: string;

  /**
   * AWS region — pinned to us-east-1.
   *
   * CloudFront only accepts TLS certificates issued in us-east-1, no matter
   * where the rest of the stack lives. Keeping everything in that one region
   * sidesteps the problem entirely. If you ever move the stack elsewhere, the
   * certificate must stay behind in us-east-1 as its own stack — the guard in
   * bin/oddssea.ts throws rather than let that be discovered mid-deploy.
   */
  region: string;

  /**
   * The registered domain, apex only — e.g. "oddssea.xyz".
   *
   * Leave `undefined` to serve from CloudFront's generated
   * `dxxxx.cloudfront.net` URL instead. Everything works either way; the
   * custom domain is purely additive.
   *
   * Setting this requires a **public Route53 hosted zone for the domain in
   * this same AWS account** — CDK looks the zone up by name at synth time and
   * creates the DNS and certificate-validation records in it. The walkthrough
   * (infra/README.md) covers creating the zone and pointing GoDaddy at it.
   */
  domainName?: string;

  /**
   * Subdomain to serve from: "dev" produces dev.oddssea.xyz.
   * Leave undefined to serve from the apex itself.
   */
  subdomain?: string;

  /** GitHub repo allowed to deploy via CI/CD. */
  github: {
    owner: string;
    repo: string;
    /** Only this branch may deploy. Anything else is refused by IAM. */
    branch: string;
  };

  /**
   * An AWS account may hold only ONE GitHub OIDC identity provider (one per
   * issuer URL). Leave true on a fresh account. If the CI/CD stack fails with
   * "provider already exists", set this to false — the deploy role then
   * imports the existing provider by ARN instead of creating a second one.
   */
  createGithubOidcProvider: boolean;
}

export const configs: Record<string, AppConfig> = {
  dev: {
    envName: 'dev',
    account: '845081398483',
    region: 'us-east-1',

    // Requires the Route53 hosted zone to exist and the registrar's
    // nameservers to point at it — verified 2026-08-03 (GoDaddy → the four
    // awsdns servers). Set both to undefined to fall back to the CloudFront
    // domain.
    domainName: 'oddssea.xyz',
    subdomain: 'dev',

    github: {
      owner: 'noahndambukig',
      repo: 'oddssea',
      branch: 'main',
    },

    createGithubOidcProvider: true,
  },
};

export function getConfig(envName: string): AppConfig {
  const config = configs[envName];
  if (!config) {
    const known = Object.keys(configs).join(', ');
    throw new Error(`Unknown environment "${envName}". Known environments: ${known}`);
  }
  return config;
}

/**
 * The full hostname the app is served from, e.g. "dev.oddssea.xyz" — or
 * undefined when running on the CloudFront domain, in which case the URL is
 * only known after the distribution is created.
 */
export function appHostname(config: AppConfig): string | undefined {
  if (!config.domainName) return undefined;
  return config.subdomain ? `${config.subdomain}.${config.domainName}` : config.domainName;
}
