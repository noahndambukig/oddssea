/**
 * Invoke the migration Lambda and FAIL LOUDLY if it did not work.
 *
 * One implementation, two callers: `npm run deploy` locally and the deploy
 * workflow. The validation must live in both, because local is where the
 * first deploy happens — a check that existed only in CI would let a
 * hand-run deploy publish the app stack over a failed migration.
 *
 * WRITTEN IN NODE, NOT BASH. npm runs scripts through the platform shell:
 * `cmd.exe` on Windows, where `bash` is not on PATH even with Git installed.
 * The previous version of this file was a .sh and failed on the first real
 * deploy — the second time in this milestone that a build step assumed a
 * Unix toolchain. Node is guaranteed present: npm is running on it.
 *
 * Two traps this exists to avoid:
 *
 *   1. `aws lambda invoke` EXITS 0 WHEN THE FUNCTION THROWS. The API call
 *      succeeded; the function failing is reported in FunctionError, not the
 *      exit code. Checking the exit status alone is the same class of
 *      mistake as trusting an HTTP 200 to mean a file exists.
 *
 *   2. The CLI's default read timeout is 60 seconds, while the migration
 *      Lambda may run for five minutes — it can be waiting out a paused
 *      cluster's resume. Without --cli-read-timeout the caller gives up on a
 *      function that is still working and reports a failure that is not one.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const stack = process.argv[2] ?? 'Oddssea-dev-Data';
const region = process.env.AWS_REGION ?? 'us-east-1';

// AWS CLI v2 ships aws.exe on Windows; `shell: true` also lets a .cmd
// shim resolve, which some installers use.
function aws(args) {
  return execFileSync('aws', args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
}

console.log(`Resolving migration function from ${stack}…`);

/**
 * No `--query`, and the filtering happens in Node.
 *
 * A JMESPath expression contains `[?OutputKey=='…']` — brackets, quotes and
 * question marks, all of which a shell interprets. Windows needs `shell:
 * true` to resolve `aws.cmd`, so the argument must be quoted there; Linux
 * runs without a shell, where those same quotes become part of the
 * expression and it silently matches nothing. The pipeline failed with
 * "could not resolve MigrationFunctionName" while the identical command
 * worked locally.
 *
 * Asking for plain JSON removes the shell from the problem entirely: the
 * arguments contain nothing either platform will touch. This is the THIRD
 * shell-portability bug in this milestone (`cp`, then `bash`, now quoting),
 * so the rule is now: build-time commands take only inert arguments and do
 * their thinking in Node.
 */
const described = JSON.parse(
  aws(['cloudformation', 'describe-stacks', '--stack-name', stack, '--region', region, '--output', 'json']),
);
const functionName = described.Stacks?.[0]?.Outputs?.find(
  (o) => o.OutputKey === 'MigrationFunctionName',
)?.OutputValue;

if (!functionName) {
  console.error(`ERROR: could not resolve MigrationFunctionName from ${stack}.`);
  console.error('Outputs present:', (described.Stacks?.[0]?.Outputs ?? []).map((o) => o.OutputKey).join(', '));
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), 'oddssea-migrate-'));
const responsePath = join(dir, 'response.json');

try {
  console.log(`Invoking ${functionName}…`);
  const invokeOutput = aws([
    'lambda', 'invoke',
    '--function-name', functionName,
    '--region', region,
    '--cli-read-timeout', '360',
    '--cli-connect-timeout', '30',
    '--payload', '{}',
    '--cli-binary-format', 'raw-in-base64-out',
    responsePath,
  ]);

  console.log(invokeOutput);

  // Trap 1: the function threw, but the CLI is about to report success.
  if (invokeOutput.includes('FunctionError')) {
    console.error('ERROR: migration function reported an error.');
    console.error(readFileSync(responsePath, 'utf8'));
    process.exit(1);
  }

  const body = readFileSync(responsePath, 'utf8');
  console.log(body);

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    console.error('ERROR: migration response was not JSON.');
    process.exit(1);
  }

  if (payload?.ok !== true) {
    console.error('ERROR: migration payload did not report success.');
    process.exit(1);
  }

  const applied = payload.applied ?? [];
  console.log(
    applied.length ? `Applied: ${applied.join(', ')}` : 'Nothing to apply (already up to date)',
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
