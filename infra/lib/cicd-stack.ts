import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { AppConfig } from './config';

export interface CicdStackProps extends cdk.StackProps {
  config: AppConfig;
}

const GITHUB_ISSUER = 'token.actions.githubusercontent.com';

/**
 * Lets GitHub Actions deploy to this account with NO stored credentials.
 *
 * The old way: create an IAM user, generate a long-lived access key, paste it
 * into GitHub secrets. If it leaks, it works for whoever holds it until
 * someone notices and revokes it.
 *
 * The OIDC way: each workflow run, GitHub signs a short-lived token that
 * states exactly which repo and branch is running. AWS is configured (below)
 * to trust GitHub's signature, checks those claims against the conditions,
 * and issues credentials valid for one hour. Nothing is stored anywhere, and
 * nothing that could leak stays usable.
 *
 * Deployed once, by hand — it is the bootstrap that makes automated deploys
 * possible, so it cannot itself be deployed automatically.
 */
export class CicdStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CicdStackProps) {
    super(scope, id, props);

    const { config } = props;
    const { owner, repo, branch } = config.github;

    // One provider per issuer URL per account — see config.ts. When one
    // already exists (another project wired up GitHub Actions before), it is
    // imported by ARN instead of created, and the deploy proceeds.
    const providerArn = `arn:aws:iam::${this.account}:oidc-provider/${GITHUB_ISSUER}`;

    if (config.createGithubOidcProvider) {
      new iam.CfnOIDCProvider(this, 'GithubOidcProvider', {
        url: `https://${GITHUB_ISSUER}`,
        // The audience GitHub stamps on tokens meant for AWS.
        clientIdList: ['sts.amazonaws.com'],
      });
    }

    const deployRole = new iam.Role(this, 'GithubDeployRole', {
      roleName: `oddssea-${config.envName}-github-deploy`,
      description: `Assumed by GitHub Actions from ${owner}/${repo}@${branch}`,
      maxSessionDuration: cdk.Duration.hours(1),

      assumedBy: new iam.FederatedPrincipal(
        providerArn,
        {
          StringEquals: {
            // Who the token was minted FOR.
            [`${GITHUB_ISSUER}:aud`]: 'sts.amazonaws.com',

            // -------------------------------------------------------------
            // THE IMPORTANT LINE.
            //
            // `sub` names the exact workflow context. Without this
            // condition, ANY repository on GitHub could assume the role —
            // the provider trusts GitHub as an issuer, not you specifically.
            // This narrows it to one branch of one repo.
            //
            // Other useful shapes, for later:
            //   repo:owner/repo:pull_request       — PR runs
            //   repo:owner/repo:environment:prod   — GitHub Environments
            // -------------------------------------------------------------
            [`${GITHUB_ISSUER}:sub`]: `repo:${owner}/${repo}:ref:refs/heads/${branch}`,
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
    });

    /**
     * What the role may do — deliberately narrow.
     *
     * NOT AdministratorAccess. A CDK deploy works by assuming the roles that
     * `cdk bootstrap` created (cdk-*-deploy-role, -file-publishing-role,
     * -lookup-role); those hold the real permissions. This role only needs
     * to be allowed to step into them.
     */
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AssumeCdkBootstrapRoles',
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      }),
    );

    // The CDK CLI reads the bootstrap stack's version from SSM Parameter
    // Store before deploying, to confirm compatibility.
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ReadCdkBootstrapVersion',
        actions: ['ssm:GetParameter'],
        resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/cdk-bootstrap/*`],
      }),
    );

    // Lets the workflow print stack outputs after deploying.
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ReadStackOutputs',
        actions: ['cloudformation:DescribeStacks'],
        resources: ['*'],
      }),
    );

    new cdk.CfnOutput(this, 'DeployRoleArn', {
      value: deployRole.roleArn,
      description: 'Set this as the GitHub repository variable AWS_DEPLOY_ROLE_ARN',
    });
  }
}
