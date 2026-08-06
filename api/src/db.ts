/**
 * Talking to Postgres over HTTP.
 *
 * There is no connection here — no pool, no driver, no VPC. The RDS Data API
 * takes a signed HTTPS request and returns rows. That choice is what lets the
 * cluster scale to zero: anything holding a connection open (RDS Proxy, a
 * cron, a psql session) prevents the pause, and the pause is the entire cost
 * model (docs/decisions/0020).
 *
 * The price is paid here, in two places:
 *
 *   1. Each statement is a round trip, so a transaction is several. The
 *      economic writes are single PL/pgSQL function calls precisely so that a
 *      whole money movement is ONE call — atomic by construction, with no
 *      half-open transaction if this Lambda dies mid-flight.
 *
 *   2. A paused cluster takes ~15s to wake, or 30s+ after a day asleep. That
 *      cannot be waited out: HTTP APIs cap integration timeout near 29s and
 *      it is not increasable. So `resuming` is a first-class outcome that the
 *      caller turns into 503 + Retry-After, and the client retries with the
 *      same Idempotency-Key.
 */

import {
  RDSDataClient,
  ExecuteStatementCommand,
  BeginTransactionCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
  type Field,
  type SqlParameter,
} from '@aws-sdk/client-rds-data';

const client = new RDSDataClient({});

const CLUSTER_ARN = process.env.CLUSTER_ARN!;
const APP_SECRET_ARN = process.env.APP_SECRET_ARN!;
const DATABASE_NAME = process.env.DATABASE_NAME ?? 'oddssea';

/** Thrown when the cluster is still waking. The caller answers 503. */
export class DatabaseResumingError extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds = 5) {
    super('Database is resuming');
    this.name = 'DatabaseResumingError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function isResuming(error: unknown): boolean {
  const name = (error as { name?: string })?.name ?? '';
  const message = (error as { message?: string })?.message ?? '';
  return (
    name === 'DatabaseResumingException' ||
    /resuming|is being started|not currently available/i.test(message)
  );
}

/**
 * Parameter values, converted to the Data API's tagged union.
 *
 * `null` needs `isNull: true` rather than an absent value — a missing field
 * is a malformed parameter, not a NULL.
 */
export type Param = string | number | bigint | boolean | null;

function toField(value: Param): Field {
  if (value === null) return { isNull: true };
  switch (typeof value) {
    case 'string':
      return { stringValue: value };
    case 'boolean':
      return { booleanValue: value };
    case 'bigint':
      return { longValue: Number(value) };
    case 'number':
      return Number.isInteger(value) ? { longValue: value } : { doubleValue: value };
  }
}

function toParameters(params: Record<string, Param>): SqlParameter[] {
  return Object.entries(params).map(([name, value]) => ({ name, value: toField(value) }));
}

function fromField(field: Field): unknown {
  if (field.isNull) return null;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.longValue !== undefined) return field.longValue;
  if (field.doubleValue !== undefined) return field.doubleValue;
  if (field.booleanValue !== undefined) return field.booleanValue;
  return null;
}

export interface QueryOptions {
  transactionId?: string;
  /**
   * How long to keep retrying a resuming cluster. Kept BELOW the Lambda's
   * own timeout so the handler can still write a 503 — a Lambda that dies of
   * timeout returns a 502 the client cannot interpret.
   */
  resumeBudgetMs?: number;
}

async function send<T>(operation: () => Promise<T>, budgetMs: number): Promise<T> {
  const deadline = Date.now() + budgetMs;
  let attempt = 0;

  for (;;) {
    try {
      return await operation();
    } catch (error) {
      if (!isResuming(error)) throw error;
      if (Date.now() >= deadline) throw new DatabaseResumingError();
      attempt += 1;
      await new Promise((r) => setTimeout(r, Math.min(1_000 * attempt, 4_000)));
    }
  }
}

/** Rows as plain objects, keyed by the column names the Data API returns. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: Record<string, Param> = {},
  options: QueryOptions = {},
): Promise<T[]> {
  const result = await send(
    () =>
      client.send(
        new ExecuteStatementCommand({
          resourceArn: CLUSTER_ARN,
          secretArn: APP_SECRET_ARN,
          database: DATABASE_NAME,
          sql,
          parameters: toParameters(params),
          transactionId: options.transactionId,
          includeResultMetadata: true,
        }),
      ),
    options.resumeBudgetMs ?? 15_000,
  );

  const columns = (result.columnMetadata ?? []).map((c) => c.label ?? c.name ?? '');
  return (result.records ?? []).map((record) => {
    const row: Record<string, unknown> = {};
    record.forEach((field, i) => {
      row[columns[i]] = fromField(field);
    });
    return row as T;
  });
}

/**
 * Call one of the SECURITY DEFINER functions and return its JSON result.
 *
 * Every economic write is exactly this: one statement, one round trip, one
 * transaction inside Postgres. The API role cannot write any table directly —
 * it holds EXECUTE and nothing else — so this is not a convenience wrapper,
 * it is the only door.
 */
export async function callFunction<T>(
  name: string,
  params: Record<string, Param>,
  options: QueryOptions = {},
): Promise<T> {
  const names = Object.keys(params);
  const args = names.map((n) => `:${n}`).join(', ');
  const rows = await query<Record<string, unknown>>(
    `SELECT ${name}(${args}) AS result`,
    params,
    options,
  );

  const raw = rows[0]?.result;
  if (raw === undefined || raw === null) return null as T;
  return (typeof raw === 'string' ? JSON.parse(raw) : raw) as T;
}

/**
 * Multi-statement transaction, for the few paths that genuinely need one —
 * the login callback, which must upsert the player and complete the attempt
 * together. Everything economic uses a single function call instead.
 */
export async function withTransaction<T>(
  work: (transactionId: string) => Promise<T>,
): Promise<T> {
  const begun = await send(
    () =>
      client.send(
        new BeginTransactionCommand({
          resourceArn: CLUSTER_ARN,
          secretArn: APP_SECRET_ARN,
          database: DATABASE_NAME,
        }),
      ),
    15_000,
  );
  const transactionId = begun.transactionId!;

  try {
    const result = await work(transactionId);
    await client.send(
      new CommitTransactionCommand({
        resourceArn: CLUSTER_ARN,
        secretArn: APP_SECRET_ARN,
        transactionId,
      }),
    );
    return result;
  } catch (error) {
    await client
      .send(
        new RollbackTransactionCommand({
          resourceArn: CLUSTER_ARN,
          secretArn: APP_SECRET_ARN,
          transactionId,
        }),
      )
      .catch(() => undefined);
    throw error;
  }
}

/**
 * Wake the cluster before doing anything irreversible.
 *
 * The login callback calls this FIRST, because the OAuth code it is about to
 * spend is single-use: if the database turns out to be asleep after the code
 * is consumed, the code is gone and the user is stranded. Order the
 * irreversible step last.
 */
export async function warm(budgetMs = 15_000): Promise<boolean> {
  try {
    await query('SELECT 1', {}, { resumeBudgetMs: budgetMs });
    return true;
  } catch (error) {
    if (error instanceof DatabaseResumingError || isResuming(error)) return false;
    throw error;
  }
}
