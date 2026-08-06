import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { AppConfig } from './config';

export interface DataStackProps extends cdk.StackProps {
  config: AppConfig;
}

/**
 * The database, in its own stack — and the stack boundary is the point.
 *
 * Everything in the App stack is reproducible: destroy it and redeploy and
 * you have lost nothing. A ledger is the first thing in this project that is
 * not, so it gets a lifecycle of its own. That separation also solves an
 * ordering problem: the App stack publishes the website *during* its own
 * update, so there is no moment "after the stack updates but before the site
 * goes live" in which to run migrations. Making the database a separate,
 * earlier deploy is the only way to guarantee the schema is ahead of the
 * code that uses it.
 */
export class DataStack extends cdk.Stack {
  readonly cluster: rds.DatabaseCluster;

  /** Credentials the API uses — a restricted role, created by migration 001. */
  readonly appSecret: secretsmanager.Secret;

  /** Deterministic name so CicdStack can grant against it before it exists. */
  static migrationFunctionName(envName: string): string {
    return `oddssea-${envName}-migrate`;
  }

  /**
   * State the availability zones instead of discovering them.
   *
   * By default CDK asks AWS which AZs this account has — a CONTEXT LOOKUP,
   * which needs credentials. CI synthesises with none, deliberately: that is
   * the entire point of the keyless OIDC design, and it is why the hosted
   * zone is already cached in cdk.context.json. A VPC would have added a
   * second lookup and broken every pipeline run until someone ran a
   * credentialed synth locally and committed the result.
   *
   * Overriding the getter removes the lookup altogether. Safe here because
   * the region is pinned to us-east-1 (lib/config.ts) and every region has
   * at least these two zones. Aurora needs exactly two.
   */
  get availabilityZones(): string[] {
    return [`${this.region}a`, `${this.region}b`];
  }

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const { config } = props;

    /**
     * Aurora requires a VPC. NOTHING ELSE GOES IN IT.
     *
     * `natGateways: 0` is the single most expensive line in this file to get
     * wrong. The CDK default is ONE NAT GATEWAY PER AVAILABILITY ZONE at
     * roughly $32/month each — for a project whose entire fixed cost today
     * is one Route53 hosted zone. Nothing would fail; the bill would just
     * arrive.
     *
     * We can afford zero because the Lambdas never enter this VPC: they
     * reach the database over the RDS Data API's public HTTPS endpoint with
     * IAM auth. Isolated subnets have no route to the internet at all, which
     * is exactly right for a database nothing else should reach.
     */
    const vpc = new ec2.Vpc(this, 'Vpc', {
      /**
       * Availability zones stated EXPLICITLY, not `maxAzs`.
       *
       * `maxAzs` makes CDK perform a context lookup to discover which AZs
       * the account has — and a lookup needs credentials. CI synthesises
       * with none (that is the whole point of the OIDC design), so `maxAzs`
       * would fail every pipeline run until someone ran a credentialed
       * synth locally and committed cdk.context.json. Naming the AZs
       * removes the lookup, and the region is pinned to us-east-1 anyway.
       *
       * Two is Aurora's minimum; more would only add unused subnets.
       */
      availabilityZones: [`${config.region}a`, `${config.region}b`],
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    /**
     * The cluster.
     *
     * `serverlessV2MinCapacity: 0` is what makes this project affordable:
     * with no connections for the idle window, the instance pauses and bills
     * nothing but storage. It is also fragile in a specific way — ANY held
     * connection prevents it (RDS Proxy, a scheduled job, a psql session
     * left open on your laptop), silently and with no error. See
     * docs/decisions/0020.
     *
     * `storageEncrypted` defaults to FALSE in CDK, and encryption cannot be
     * switched on in place afterwards — it needs a snapshot-copy-and-restore
     * of a database holding balances and refresh tokens. Set at creation or
     * not at all.
     */
    this.cluster = new rds.DatabaseCluster(this, 'Cluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        // Pinned inside the range AWS documents for auto-pause (16.3+,
        // 15.7+, 14.12+, 13.15+). 17.x postdates that list, and the entire
        // cost model rests on minimum-capacity-0 actually being honoured.
        version: rds.AuroraPostgresEngineVersion.VER_16_13,
      }),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      writer: rds.ClusterInstance.serverlessV2('Writer'),
      serverlessV2MinCapacity: 0,
      serverlessV2MaxCapacity: 2,
      serverlessV2AutoPauseDuration: cdk.Duration.minutes(10),
      enableDataApi: true,
      storageEncrypted: true,
      defaultDatabaseName: 'oddssea',
      // The ledger is the first thing here worth keeping. Everything else in
      // this project is DESTROY because it can be rebuilt from source.
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
    });

    /**
     * The application role's password.
     *
     * RETAIN, deliberately: CDK secrets default to DESTROY, so deleting this
     * stack would keep the snapshot (above) and delete the credentials —
     * leaving a perfectly preserved database that nobody can open. A backup
     * is only as recoverable as its least-retained dependency.
     */
    this.appSecret = new secretsmanager.Secret(this, 'AppSecret', {
      description: 'oddssea_app database role — the API connects as this',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'oddssea_app' }),
        generateStringKey: 'password',
        // Postgres passwords: keep out of quoting trouble entirely.
        excludeCharacters: `"'\\/@ `,
        passwordLength: 40,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    /**
     * Same reasoning for the cluster's own admin secret — but reaching it
     * takes care.
     *
     * `cluster.secret` is the secret TARGET ATTACHMENT, not the secret. The
     * obvious `cluster.secret.node.defaultChild` therefore sets a removal
     * policy on a wrapper resource and leaves the actual credentials on the
     * default, DELETE. Verified in the synthesized template: the attachment
     * said Retain while `ClusterSecret` still said Delete — which would have
     * produced the exact failure this is meant to prevent, a preserved
     * snapshot whose admin password no longer exists.
     *
     * The real secret is the construct CDK creates at `Cluster/Secret`.
     */
    const adminSecret = this.cluster.node.tryFindChild('Secret') as
      | secretsmanager.Secret
      | undefined;
    (adminSecret?.node.defaultChild as secretsmanager.CfnSecret | undefined)?.applyRemovalPolicy(
      cdk.RemovalPolicy.RETAIN,
    );

    const migrationLogs = new logs.LogGroup(this, 'MigrationLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    /**
     * The migration runner.
     *
     * A fixed `functionName` because CicdStack is deployed BEFORE this stack
     * exists and must grant `lambda:InvokeFunction` against a constructed
     * ARN — it cannot reference a resource that has not been created yet.
     *
     * Five minutes, not the 3-second default: every deploy hits a
     * deliberately paused cluster, so the first statement waits out a resume
     * before any migration runs.
     */
    const migrationFunction = new NodejsFunction(this, 'Migrate', {
      functionName: DataStack.migrationFunctionName(config.envName),
      entry: path.join(__dirname, '../../api/src/migrate.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      logGroup: migrationLogs,
      environment: {
        CLUSTER_ARN: this.cluster.clusterArn,
        ADMIN_SECRET_ARN: this.cluster.secret!.secretArn,
        APP_SECRET_ARN: this.appSecret.secretArn,
        DATABASE_NAME: 'oddssea',
      },
      bundling: {
        /**
         * esbuild bundles JavaScript. The .sql files are data, and without
         * this hook they simply would not be in the deployment package.
         *
         * The copy runs through NODE, not `cp`.
         *
         * CDK executes these hooks through the platform shell — `cmd.exe` on
         * Windows, where `cp` does not exist. It works under Git Bash, which
         * ships coreutils, so the failure is invisible to anyone who
         * synthesises there and immediate for anyone who uses PowerShell. A
         * build step that depends on which terminal you opened is a bug
         * whatever it copies. Node is guaranteed present: CDK is running on
         * it.
         *
         * Paths are normalised to forward slashes because Windows paths
         * contain backslashes, which would be escape sequences inside the
         * JavaScript string literal below.
         */
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (inputDir: string, outputDir: string) => {
            const from = `${inputDir}/api/migrations`.replace(/\\/g, '/');
            const to = `${outputDir}/migrations`.replace(/\\/g, '/');
            return [
              `node -e "require('fs').cpSync('${from}','${to}',{recursive:true})"`,
            ];
          },
        },
      },
    });

    /**
     * The migration Lambda is the one caller that legitimately needs admin.
     * `grantDataApiAccess` also grants read on the cluster's master secret —
     * appropriate here, and precisely why the API Lambda must NOT use it.
     */
    this.cluster.grantDataApiAccess(migrationFunction);
    this.appSecret.grantRead(migrationFunction);

    new cdk.CfnOutput(this, 'MigrationFunctionName', {
      value: migrationFunction.functionName,
      description: 'Invoked by scripts/run-migrations.sh between stack deploys',
    });
    new cdk.CfnOutput(this, 'ClusterArn', { value: this.cluster.clusterArn });
    new cdk.CfnOutput(this, 'ClusterEndpoint', {
      value: this.cluster.clusterEndpoint.hostname,
      description: 'Not reachable from your machine — isolated subnets, Data API only',
    });
    new cdk.CfnOutput(this, 'AppSecretArn', { value: this.appSecret.secretArn });

    cdk.Tags.of(this).add('stack-role', 'data');
  }
}
