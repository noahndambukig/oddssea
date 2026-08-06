-- 002 — UUIDv7, then the tables.
--
-- gen_random_bytes() lives in pgcrypto, NOT in core. (gen_random_uuid() *is*
-- core since Postgres 13, which is exactly what makes this easy to forget.)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- data-model.md mandates UUIDv7 keys. Postgres 16 has no uuidv7() built in
-- (it arrives in 18) and Node's randomUUID() is v4, so it is implemented
-- here: 48 bits of millisecond timestamp, then random bits, with the version
-- (7) and variant nibbles overwritten.
--
-- The point of v7 over v4 is ORDERING. Keys sort by creation time, so an
-- append-heavy ledger writes to the end of its index instead of scattering
-- inserts across the whole B-tree. Random v4 keys turn every insert into a
-- random page write.
CREATE OR REPLACE FUNCTION uuidv7()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  unix_ms bigint := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;
  bytes bytea := gen_random_bytes(16);
BEGIN
  -- 48-bit big-endian timestamp in the first six bytes.
  bytes := set_byte(bytes, 0, ((unix_ms >> 40) & 255)::int);
  bytes := set_byte(bytes, 1, ((unix_ms >> 32) & 255)::int);
  bytes := set_byte(bytes, 2, ((unix_ms >> 24) & 255)::int);
  bytes := set_byte(bytes, 3, ((unix_ms >> 16) & 255)::int);
  bytes := set_byte(bytes, 4, ((unix_ms >> 8) & 255)::int);
  bytes := set_byte(bytes, 5, (unix_ms & 255)::int);
  -- Version 7 in the high nibble of byte 6.
  bytes := set_byte(bytes, 6, ((get_byte(bytes, 6) & 15) | 112));
  -- RFC 4122 variant (10xx) in the high bits of byte 8.
  bytes := set_byte(bytes, 8, ((get_byte(bytes, 8) & 63) | 128));
  RETURN encode(bytes, 'hex')::uuid;
END;
$$;

-- ---------------------------------------------------------------- players
--
-- Keyed by the Cognito subject. The cached balances are an optimisation —
-- ledger_entries is the source of truth — but they carry non-negative CHECK
-- constraints so an overdraft is impossible rather than merely unlikely.
-- game-modes.md keeps all-in a legitimate play, so concurrent all-ins are a
-- case the schema must survive, not a hypothetical.
CREATE TABLE players (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  cognito_sub       text NOT NULL UNIQUE,
  email             text,
  display_name      text,
  age_attested_at   timestamptz,
  streak_run        integer NOT NULL DEFAULT 0,
  last_claim_date   date,
  shells_balance    bigint NOT NULL DEFAULT 0 CHECK (shells_balance >= 0),
  pearls_balance    bigint NOT NULL DEFAULT 0 CHECK (pearls_balance >= 0),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------- ledger_entries
--
-- Append-only, one currency and one movement kind per row. A winning dice
-- bet is therefore THREE rows: the Shell stake, the Shell payout, and the
-- Pearl award. Enforcement is not by convention — 004 grants oddssea_app no
-- UPDATE or DELETE anywhere.
CREATE TABLE ledger_entries (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  player_id     uuid NOT NULL REFERENCES players(id),
  currency      text NOT NULL CHECK (currency IN ('shells', 'pearls')),
  amount        bigint NOT NULL,
  kind          text NOT NULL CHECK (kind IN (
                  'task_claim', 'bet_stake', 'bet_payout', 'pearl_award',
                  'crate_purchase', 'direct_purchase', 'salvage', 'fusion',
                  'lottery_ticket', 'lottery_payout', 'lottery_match',
                  'qol_purchase', 'completion_bonus', 'referral_reward',
                  'tip_received', 'marketplace_sale', 'marketplace_burn',
                  'adjustment')),
  ref_table     text,
  ref_id        uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ledger_entries_player_currency ON ledger_entries (player_id, currency);

-- ------------------------------------------------- sessions, login flow
--
-- Credential tables. oddssea_app gets NO select on either — they are
-- reachable only through the SECURITY DEFINER functions in 003.
CREATE TABLE sessions (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  player_id       uuid NOT NULL REFERENCES players(id),
  refresh_token   text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL
);

CREATE INDEX sessions_player ON sessions (player_id);

-- One row per login attempt. `state` is the OAuth state; `binding_secret` is
-- the value held in an httpOnly cookie. Replay requires BOTH — state travels
-- in a URL (history, referers, logs) and must never be a bearer credential
-- on its own.
--
-- `claimed_at` is a LEASE, not a permanent mark: a crashed invocation would
-- otherwise strand the attempt and every retry behind it.
CREATE TABLE login_attempts (
  state             text PRIMARY KEY,
  binding_secret    text NOT NULL,
  code_verifier     text NOT NULL,
  redirect_uri      text NOT NULL,
  return_to         text NOT NULL DEFAULT '/',
  claimed_at        timestamptz,
  session_id        uuid REFERENCES sessions(id),
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------- idempotency
--
-- The stored response is the point: a retry must receive the same answer it
-- would have received, not merely avoid a second charge.
CREATE TABLE idempotency_keys (
  player_id     uuid NOT NULL REFERENCES players(id),
  key           text NOT NULL,
  response      jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, key)
);

-- ------------------------------------------------------------ task claims
--
-- UTC dates throughout (data-model.md rule 6): one global boundary, not
-- shoppable by changing a timezone, and the only thing a shared daily draw
-- could ever use.
CREATE TABLE task_claims (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  player_id     uuid NOT NULL REFERENCES players(id),
  task_key      text NOT NULL,
  claim_date    date NOT NULL,
  amount        bigint NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, task_key, claim_date)
);

-- ------------------------------------------------------------------ bets
CREATE TABLE bets (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  player_id         uuid NOT NULL REFERENCES players(id),
  game              text NOT NULL,
  stake             bigint NOT NULL CHECK (stake > 0),
  -- Nullable on purpose: crash has no price until the player cashes out.
  decimal_odds      numeric(12, 4),
  state             text NOT NULL CHECK (state IN ('open', 'settled', 'voided')),
  payout            bigint NOT NULL DEFAULT 0,
  pearls_awarded    bigint NOT NULL DEFAULT 0,
  content_version   text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  settled_at        timestamptz
);

CREATE INDEX bets_player ON bets (player_id);

-- Per-game detail. Dice stores the roll AND its range: a roll is only
-- meaningful against the space it was drawn from (data-model.md rule 5).
CREATE TABLE bet_dice (
  bet_id        uuid PRIMARY KEY REFERENCES bets(id),
  direction     text NOT NULL CHECK (direction IN ('over', 'under')),
  threshold     integer NOT NULL,
  roll          integer NOT NULL,
  roll_max      integer NOT NULL,
  won           boolean NOT NULL
);
