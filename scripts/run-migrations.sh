#!/usr/bin/env bash
#
# Invoke the migration Lambda and FAIL LOUDLY if it did not work.
#
# One script, two callers: `npm run deploy` locally and the deploy workflow.
# The validation must live in both, because local is where the first deploy
# happens — a check that exists only in CI would let a hand-run deploy
# publish the app stack over a failed migration.
#
# Two traps this exists to avoid:
#
#   1. `aws lambda invoke` EXITS 0 WHEN THE FUNCTION THROWS. The API call
#      succeeded; the function failing is reported in the FunctionError field
#      of the response, not the exit code. Checking $? alone is the same
#      class of mistake as trusting an HTTP 200 to mean a file exists.
#
#   2. The CLI's default read timeout is 60 seconds, while the migration
#      Lambda is allowed five minutes — it may be waiting out a paused
#      cluster's resume. Without --cli-read-timeout the caller gives up on a
#      function that is still working, and reports a failure that is not one.
set -euo pipefail

STACK="${1:-Oddssea-dev-Data}"
REGION="${AWS_REGION:-us-east-1}"

echo "Resolving migration function from ${STACK}…"
FUNCTION_NAME=$(aws cloudformation describe-stacks \
  --stack-name "${STACK}" \
  --region "${REGION}" \
  --query "Stacks[0].Outputs[?OutputKey=='MigrationFunctionName'].OutputValue" \
  --output text)

if [ -z "${FUNCTION_NAME}" ] || [ "${FUNCTION_NAME}" = "None" ]; then
  echo "ERROR: could not resolve MigrationFunctionName from ${STACK}." >&2
  exit 1
fi

RESPONSE=$(mktemp)
trap 'rm -f "${RESPONSE}"' EXIT

echo "Invoking ${FUNCTION_NAME}…"
INVOKE_OUTPUT=$(aws lambda invoke \
  --function-name "${FUNCTION_NAME}" \
  --region "${REGION}" \
  --cli-read-timeout 360 \
  --cli-connect-timeout 30 \
  --payload '{}' \
  --cli-binary-format raw-in-base64-out \
  "${RESPONSE}")

echo "${INVOKE_OUTPUT}"

# Trap 1: the function threw, but the CLI is about to exit 0.
if echo "${INVOKE_OUTPUT}" | grep -q '"FunctionError"'; then
  echo "ERROR: migration function reported an error." >&2
  cat "${RESPONSE}" >&2
  exit 1
fi

# The runner reports what it did; an `ok: false` payload is also a failure.
cat "${RESPONSE}"
echo
if ! grep -q '"ok":true' "${RESPONSE}"; then
  echo "ERROR: migration payload did not report success." >&2
  exit 1
fi

echo "Migrations applied."
