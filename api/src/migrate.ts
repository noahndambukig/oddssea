/**
 * The migration runner.
 *
 * Applies numbered .sql files in order, exactly once, recording what it did
 * in `schema_migrations`. Four things here are less obvious than they look,
 * and each one is a bug that would not have announced itself:
 *
 * 1. THE LOCK MUST PRECEDE THE RE-CHECK. Two runners can both compute the
 *    same list of pending migrations before either takes the lock. If the
 *    "has this been applied?" answer is only read before locking, the second
 *    runner replays committed DDL. This is time-of-check/time-of-use, and
 *    the fix is to ask again *after* acquiring the lock.
 *
 * 2. THE LOCK MUST BE TRANSACTION-SCOPED. Data API calls have NO session
 *    affinity unless they share a transaction id — each ExecuteStatement can
 *    land on a different backend. A session-scoped `pg_advisory_lock` taken
 *    in one call therefore protects nothing in the next. `pg_advisory_xact_lock`
 *    inside an explicit transaction is what actually holds.
 *
 * 3. CHECKSUMS MUST BE LINE-ENDING NORMALISED. This repo runs with
 *    core.autocrlf=true, so migrations are CRLF in a Windows worktree and LF
 *    on Ubuntu CI. Hashing raw bytes would make every unchanged migration
 *    look edited the first time the pipeline ran after a local deploy.
 *
 * 4. THE CLUSTER IS USUALLY ASLEEP. min-capacity-0 means a deploy typically
 *    finds a paused database, so every call retries through the resume
 *    rather than failing on the first attempt.
 */

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  RDSDataClient,
  ExecuteStatementCommand,
  BeginTransactionCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
  type SqlParameter,
} from '@aws-sdk/client-rds-data';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

const rds = new RDSDataClient({});
const secrets = new SecretsManagerClient({});

const CLUSTER_ARN = process.env.CLUSTER_ARN!;
const ADMIN_SECRET_ARN = process.env.ADMIN_SECRET_ARN!;
const APP_SECRET_ARN = process.env.APP_SECRET_ARN!;
const DATABASE_NAME = process.env.DATABASE_NAME ?? 'oddssea';

/** Migrations live beside the bundled handler — see the CDK commandHooks. */
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * A paused Aurora Serverless v2 cluster resumes in ~15 seconds, or 30+ if it
 * has been asleep more than a day. Every call retries through that rather
 * than treating a sleeping database as a failure.
 */
async function withResume<T>(operation: () => Promise<T>, budgetMs = 240_000): Promise<T> {
  const deadline = Date.now() + budgetMs;
  let attempt = 0;

  for (;;) {
    try {
      return await operation();
    } catch (error) {
      const name = (error as { name?: string })?.name ?? '';
      const message = (error as { message?: string })?.message ?? '';
      const resuming =
        name === 'DatabaseResumingException' ||
        /resuming|is being started|not currently available/i.test(message);

      if (!resuming || Date.now() > deadline) throw error;

      attempt += 1;
      const wait = Math.min(2_000 * attempt, 10_000);
      console.log(`Cluster resuming; retry ${attempt} in ${wait}ms`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

async function execute(
  sql: string,
  options: { parameters?: SqlParameter[]; transactionId?: string } = {},
) {
  return withResume(() =>
    rds.send(
      new ExecuteStatementCommand({
        resourceArn: CLUSTER_ARN,
        secretArn: ADMIN_SECRET_ARN,
        database: DATABASE_NAME,
        sql,
        parameters: options.parameters,
        transactionId: options.transactionId,
      }),
    ),
  );
}

/**
 * Split a migration file into individually-executable statements.
 *
 * The Data API rejects multiple top-level statements per call, so files must
 * be split. A naive split on ';' is wrong in FOUR ways, all of which occur in
 * these migrations:
 *
 *   $$ … $$   dollar-quoted PL/pgSQL bodies are full of semicolons
 *   '…'       string literals can contain them
 *   -- …      line comments can contain them (this one bit: a comment
 *             reading "the OAuth state; binding_secret is…" split a
 *             CREATE TABLE in half)
 *   /* … *\/  block comments likewise
 *
 * So the scanner tracks which of those it is inside, and only treats a
 * semicolon as a terminator at the top level.
 */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let dollarTag: string | null = null;
  let inLineComment = false;
  let inBlockComment = false;
  let inString = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const rest = sql.slice(i);

    if (inLineComment) {
      current += char;
      if (char === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      current += char;
      if (rest.startsWith('*/')) {
        current += '/';
        i += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (inString) {
      current += char;
      // '' is an escaped quote inside a string, not the end of one.
      if (char === "'") {
        if (sql[i + 1] === "'") {
          current += "'";
          i += 1;
        } else {
          inString = false;
        }
      }
      continue;
    }

    if (dollarTag) {
      if (rest.startsWith(dollarTag)) {
        current += dollarTag;
        i += dollarTag.length - 1;
        dollarTag = null;
      } else {
        current += char;
      }
      continue;
    }

    // Top level: anything that opens a region we must not split inside.
    const open = /^\$([A-Za-z_]*)\$/.exec(rest);
    if (open) {
      dollarTag = open[0];
      current += dollarTag;
      i += dollarTag.length - 1;
      continue;
    }
    if (rest.startsWith('--')) {
      inLineComment = true;
      current += char;
      continue;
    }
    if (rest.startsWith('/*')) {
      inBlockComment = true;
      current += char;
      continue;
    }
    if (char === "'") {
      inString = true;
      current += char;
      continue;
    }

    if (char === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}

/** Normalise line endings before hashing — see note 3 at the top. */
function checksum(contents: string): string {
  return createHash('sha256').update(contents.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

export async function handler() {
  const applied: string[] = [];

  // `schema_migrations` cannot be created by a migration: it is the table
  // that records which migrations ran. Idempotent DDL, outside the loop.
  await execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        text PRIMARY KEY,
      checksum    text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

  // Verify the integrity of everything already applied BEFORE applying more.
  // Recording only that a file ran would let an edited migration leave two
  // environments with different schemas while both report "up to date".
  const existing = await execute('SELECT name, checksum FROM schema_migrations');
  const recorded = new Map(
    (existing.records ?? []).map((row) => [row[0].stringValue!, row[1].stringValue!]),
  );

  for (const file of files) {
    const previous = recorded.get(file);
    if (!previous) continue;
    const now = checksum(await readFile(path.join(MIGRATIONS_DIR, file), 'utf8'));
    if (now !== previous) {
      throw new Error(
        `Migration ${file} has changed since it was applied ` +
          `(recorded ${previous.slice(0, 12)}…, now ${now.slice(0, 12)}…). ` +
          'Applied migrations are history: add a new migration instead of editing one.',
      );
    }
  }

  const appPassword = JSON.parse(
    (await secrets.send(new GetSecretValueCommand({ SecretId: APP_SECRET_ARN })))
      .SecretString!,
  ).password as string;

  for (const file of files) {
    if (recorded.has(file)) continue;

    const raw = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const hash = checksum(raw);

    const begun = await withResume(() =>
      rds.send(
        new BeginTransactionCommand({
          resourceArn: CLUSTER_ARN,
          secretArn: ADMIN_SECRET_ARN,
          database: DATABASE_NAME,
        }),
      ),
    );
    const transactionId = begun.transactionId!;

    try {
      // Transaction-scoped, so it is genuinely held across the statements
      // below — see note 2. Released automatically at commit or rollback.
      await execute('SELECT pg_advisory_xact_lock(4021974)', { transactionId });

      // Re-check AFTER the lock — see note 1. Another runner may have
      // applied this migration between our listing and our lock.
      const check = await execute('SELECT 1 FROM schema_migrations WHERE name = :name', {
        transactionId,
        parameters: [{ name: 'name', value: { stringValue: file } }],
      });
      if ((check.records ?? []).length > 0) {
        await rds.send(
          new RollbackTransactionCommand({ resourceArn: CLUSTER_ARN, secretArn: ADMIN_SECRET_ARN, transactionId }),
        );
        console.log(`${file} applied concurrently by another runner; skipping`);
        continue;
      }

      for (const statement of splitStatements(raw)) {
        await execute(statement, { transactionId });
      }

      // The one value that cannot live in a .sql file: a bind parameter is
      // not permitted in CREATE/ALTER ROLE ... PASSWORD, so migration 001
      // defines a SECURITY DEFINER function that takes it properly and
      // builds the utility statement internally with format(%L).
      if (file.startsWith('001')) {
        await execute('SELECT bootstrap_app_password(:password)', {
          transactionId,
          parameters: [{ name: 'password', value: { stringValue: appPassword } }],
        });
      }

      await execute(
        'INSERT INTO schema_migrations (name, checksum) VALUES (:name, :checksum)',
        {
          transactionId,
          parameters: [
            { name: 'name', value: { stringValue: file } },
            { name: 'checksum', value: { stringValue: hash } },
          ],
        },
      );

      await rds.send(
        new CommitTransactionCommand({ resourceArn: CLUSTER_ARN, secretArn: ADMIN_SECRET_ARN, transactionId }),
      );
      applied.push(file);
      console.log(`applied ${file}`);
    } catch (error) {
      await rds
        .send(
          new RollbackTransactionCommand({ resourceArn: CLUSTER_ARN, secretArn: ADMIN_SECRET_ARN, transactionId }),
        )
        .catch(() => undefined);
      throw error;
    }
  }

  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Nothing to apply');
  return { ok: true, applied, total: files.length };
}
