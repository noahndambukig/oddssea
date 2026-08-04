import type { RuntimeConfig } from '../runtime-config';

/**
 * Cognito's self-service user APIs, called with a raw fetch.
 *
 * No SDK on purpose: these are two POSTs to the user-pool endpoint with an
 * access token in the body, and seeing them bare teaches more than a
 * wrapper would. Both REQUIRE the token to carry the
 * `aws.cognito.signin.user.admin` scope — which is why the authorize
 * request asks for it (auth-client.ts).
 *
 * The wire format is AWS's json-1.1 protocol: the operation goes in the
 * `X-Amz-Target` header, not the URL.
 */

const ATTESTED_ATTR = 'custom:age_attested_at';

async function callUserApi<T>(
  config: RuntimeConfig,
  target: 'GetUser' | 'UpdateUserAttributes',
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`https://cognito-idp.${config.region}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${target} returned ${response.status}: ${detail}`);
  }
  return (await response.json()) as T;
}

/**
 * The authoritative answer to "has this user attested?" — reads the user
 * record itself, not a token. Used when the locally stored ID token lacks
 * the claim, because that token may simply predate the attestation.
 */
export async function fetchAttestedAt(
  config: RuntimeConfig,
  accessToken: string,
): Promise<string | null> {
  const result = await callUserApi<{
    UserAttributes?: Array<{ Name: string; Value: string }>;
  }>(config, 'GetUser', { AccessToken: accessToken });
  return result.UserAttributes?.find((a) => a.Name === ATTESTED_ATTR)?.Value ?? null;
}

/** Write the attestation timestamp onto the Cognito user. */
export async function writeAttestedAt(
  config: RuntimeConfig,
  accessToken: string,
  isoTimestamp: string,
): Promise<void> {
  await callUserApi(config, 'UpdateUserAttributes', {
    AccessToken: accessToken,
    UserAttributes: [{ Name: ATTESTED_ATTR, Value: isoTimestamp }],
  });
}
