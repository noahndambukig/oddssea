-- 003 — every write path, as a SECURITY DEFINER function.
--
-- The application role gets EXECUTE on these and no table write privilege
-- anywhere (004). That is what turns "the ledger is append-only" from a
-- comment into `permission denied`: the API cannot issue an UPDATE even if
-- its code tried to.
--
-- SECURITY DEFINER means the function runs with its OWNER's privileges, not
-- the caller's — privilege delegation, narrowed to exactly these operations.
-- It also makes search_path a security boundary: `SET search_path` with
-- pg_temp LAST stops a caller shadowing an unqualified table with a
-- temporary one. Every reference below is schema-qualified as well.

-- ------------------------------------------------------------- identity

CREATE OR REPLACE FUNCTION upsert_player(
  p_sub text,
  p_email text,
  p_attested_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.players (cognito_sub, email, age_attested_at)
  VALUES (p_sub, p_email, p_attested_at)
  ON CONFLICT (cognito_sub) DO UPDATE
    SET email = COALESCE(EXCLUDED.email, public.players.email),
        -- BACKFILL ONLY. Once /me/attest stops writing Cognito, later ID
        -- tokens carry no attestation claim, so a plain assignment would
        -- overwrite a real timestamp with NULL on the user's next login.
        age_attested_at = COALESCE(public.players.age_attested_at, EXCLUDED.age_attested_at)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION set_attestation(p_player_id uuid, p_at timestamptz)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_at timestamptz;
BEGIN
  UPDATE public.players
     SET age_attested_at = COALESCE(age_attested_at, p_at)
   WHERE id = p_player_id
  RETURNING age_attested_at INTO v_at;
  RETURN v_at;
END;
$$;

-- -------------------------------------------------------- login attempts
--
-- `sessions` and `login_attempts` hold live credentials, so the app role
-- cannot read them at all — every access is one of these functions.

CREATE OR REPLACE FUNCTION create_login_attempt(
  p_state text,
  p_binding_secret text,
  p_code_verifier text,
  p_redirect_uri text,
  p_return_to text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  INSERT INTO public.login_attempts
    (state, binding_secret, code_verifier, redirect_uri, return_to)
  VALUES (p_state, p_binding_secret, p_code_verifier, p_redirect_uri, p_return_to);
END;
$$;

-- Decide whether the irreversible code exchange should happen at all.
--
-- Returns one of three shapes, and the caller branches on them:
--   status='completed'  a previous callback already succeeded — return that
--                       session rather than re-spending a single-use code
--   status='claimed'    this caller holds the lease; proceed to exchange
--   status='busy'       another invocation holds a FRESH lease
--
-- The lease is a timestamp, not a permanent mark: a crashed invocation would
-- otherwise strand the attempt and every retry behind it forever.
CREATE OR REPLACE FUNCTION claim_login_attempt(
  p_state text,
  p_binding_secret text,
  p_lease_seconds integer DEFAULT 60
)
RETURNS TABLE (status text, code_verifier text, redirect_uri text, return_to text, session_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_row public.login_attempts%ROWTYPE;
BEGIN
  SELECT * INTO v_row
    FROM public.login_attempts
   WHERE state = p_state
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown login attempt' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- state travels in a URL — history, referers, server logs — so it can
  -- never be a credential on its own. The binding secret lives in an
  -- httpOnly cookie and must match.
  IF v_row.binding_secret IS DISTINCT FROM p_binding_secret THEN
    RAISE EXCEPTION 'login attempt binding mismatch' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_row.completed_at IS NOT NULL THEN
    RETURN QUERY SELECT 'completed'::text, v_row.code_verifier, v_row.redirect_uri,
                        v_row.return_to, v_row.session_id;
    RETURN;
  END IF;

  IF v_row.claimed_at IS NOT NULL
     AND v_row.claimed_at > now() - make_interval(secs => p_lease_seconds) THEN
    RETURN QUERY SELECT 'busy'::text, NULL::text, NULL::text, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  UPDATE public.login_attempts SET claimed_at = now() WHERE state = p_state;

  RETURN QUERY SELECT 'claimed'::text, v_row.code_verifier, v_row.redirect_uri,
                      v_row.return_to, NULL::uuid;
END;
$$;

-- Create the session and complete the attempt together. The player row is
-- upserted by the caller in the SAME transaction — a replay returning a
-- session whose player never persisted is worse than no session at all.
CREATE OR REPLACE FUNCTION complete_login_attempt(
  p_state text,
  p_player_id uuid,
  p_refresh_token text,
  p_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_session_id uuid;
BEGIN
  INSERT INTO public.sessions (player_id, refresh_token, expires_at)
  VALUES (p_player_id, p_refresh_token, p_expires_at)
  RETURNING id INTO v_session_id;

  UPDATE public.login_attempts
     SET session_id = v_session_id, completed_at = now()
   WHERE state = p_state;

  RETURN v_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION read_session(p_session_id uuid)
RETURNS TABLE (player_id uuid, cognito_sub text, refresh_token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT s.player_id, p.cognito_sub, s.refresh_token, s.expires_at
    FROM public.sessions s
    JOIN public.players p ON p.id = s.player_id
   WHERE s.id = p_session_id
     AND s.expires_at > now();
END;
$$;

CREATE OR REPLACE FUNCTION delete_session(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  DELETE FROM public.sessions WHERE id = p_session_id;
END;
$$;

-- ------------------------------------------------------------- economics
--
-- Both functions below share one shape, and every part of it matters:
--
--   1. Check the idempotency key FIRST and return the stored response if the
--      key has been seen. A retry must get the same answer, not merely avoid
--      a second charge.
--   2. Take the player row lock, so one player's economic events serialise.
--      game-modes.md keeps all-in a legitimate play, so two concurrent
--      all-ins are a case the schema must survive.
--   3. Append every movement as its OWN ledger row — one currency, one kind.
--   4. Update the cached balance, then ASSERT it equals SUM(ledger_entries)
--      and RAISE on mismatch. Because that runs inside the transaction that
--      caused the write, drift is not detected later; it is rolled back
--      before it exists.
--   5. Record the idempotency key in the SAME transaction. A separate call
--      would leave a window where the money moved and the record did not.

CREATE OR REPLACE FUNCTION assert_balance_matches_ledger(p_player_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_shells bigint;
  v_pearls bigint;
  v_cached_shells bigint;
  v_cached_pearls bigint;
BEGIN
  SELECT COALESCE(SUM(amount) FILTER (WHERE currency = 'shells'), 0),
         COALESCE(SUM(amount) FILTER (WHERE currency = 'pearls'), 0)
    INTO v_shells, v_pearls
    FROM public.ledger_entries WHERE player_id = p_player_id;

  SELECT shells_balance, pearls_balance INTO v_cached_shells, v_cached_pearls
    FROM public.players WHERE id = p_player_id;

  IF v_cached_shells <> v_shells OR v_cached_pearls <> v_pearls THEN
    RAISE EXCEPTION
      'balance drift for player %: cached (%, %) vs ledger (%, %)',
      p_player_id, v_cached_shells, v_cached_pearls, v_shells, v_pearls;
  END IF;
END;
$$;

-- Login claim: 50 Shells, +10 per consecutive day, capped at 100 on day 6.
-- Once per UTC day; a missed day resets the streak. Figures are the ones in
-- docs/02-economy/currency-model.md.
CREATE OR REPLACE FUNCTION claim_login_task(
  p_player_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_stored jsonb;
  v_player public.players%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_streak integer;
  v_amount bigint;
  v_result jsonb;
BEGIN
  SELECT response INTO v_stored
    FROM public.idempotency_keys
   WHERE player_id = p_player_id AND key = p_idempotency_key;
  IF FOUND THEN RETURN v_stored; END IF;

  SELECT * INTO v_player FROM public.players WHERE id = p_player_id FOR UPDATE;

  IF v_player.age_attested_at IS NULL THEN
    RAISE EXCEPTION 'player has not attested' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_player.last_claim_date = v_today THEN
    RAISE EXCEPTION 'already claimed today' USING ERRCODE = 'unique_violation';
  END IF;

  v_streak := CASE
    WHEN v_player.last_claim_date = v_today - 1 THEN v_player.streak_run + 1
    ELSE 1
  END;
  v_amount := LEAST(50 + 10 * (v_streak - 1), 100);

  INSERT INTO public.task_claims (player_id, task_key, claim_date, amount)
  VALUES (p_player_id, 'login', v_today, v_amount);

  INSERT INTO public.ledger_entries (player_id, currency, amount, kind, ref_table)
  VALUES (p_player_id, 'shells', v_amount, 'task_claim', 'task_claims');

  UPDATE public.players
     SET shells_balance = shells_balance + v_amount,
         streak_run = v_streak,
         last_claim_date = v_today
   WHERE id = p_player_id;

  PERFORM public.assert_balance_matches_ledger(p_player_id);

  SELECT jsonb_build_object(
    'claimed', v_amount, 'streak', v_streak, 'claimDate', v_today,
    'shells', shells_balance, 'pearls', pearls_balance
  ) INTO v_result FROM public.players WHERE id = p_player_id;

  INSERT INTO public.idempotency_keys (player_id, key, response)
  VALUES (p_player_id, p_idempotency_key, v_result);

  RETURN v_result;
END;
$$;

-- Dice: over/under a threshold on a 1..100 roll, priced at the instant-game
-- edge. Pearls are 0.75 x stake x edge, plus on a win
-- 0.30 x stake x edge x odds. Minimum stake and edge are currency-model.md's.
--
-- A winning bet writes THREE ledger rows — stake, payout, Pearls — because a
-- row carries one currency and one kind.
CREATE OR REPLACE FUNCTION place_dice_bet(
  p_player_id uuid,
  p_idempotency_key text,
  p_stake bigint,
  p_direction text,
  p_threshold integer,
  p_roll integer,
  p_roll_max integer,
  p_content_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_stored jsonb;
  v_player public.players%ROWTYPE;
  v_edge numeric := 0.03;      -- instant-game edge, currency-model.md
  v_min_stake bigint := 10;    -- minimum bet, currency-model.md
  v_wins integer;
  v_probability numeric;
  v_odds numeric;
  v_won boolean;
  v_payout bigint := 0;
  v_pearls_exact numeric;
  v_pearls_pool numeric;
  v_pearls bigint;
  v_bet_id uuid;
  v_result jsonb;
BEGIN
  SELECT response INTO v_stored
    FROM public.idempotency_keys
   WHERE player_id = p_player_id AND key = p_idempotency_key;
  IF FOUND THEN RETURN v_stored; END IF;

  IF p_direction NOT IN ('over', 'under') THEN
    RAISE EXCEPTION 'direction must be over or under' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_stake < v_min_stake THEN
    RAISE EXCEPTION 'stake below minimum of %', v_min_stake USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Winning outcomes out of p_roll_max, and therefore the true probability.
  v_wins := CASE WHEN p_direction = 'under' THEN p_threshold - 1
                 ELSE p_roll_max - p_threshold END;
  IF v_wins < 1 OR v_wins >= p_roll_max THEN
    RAISE EXCEPTION 'threshold leaves no contest' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_probability := v_wins::numeric / p_roll_max::numeric;

  -- Fair odds would be 1/p. The house edge is the whole Shell sink, so the
  -- player is paid (1 - edge)/p instead. Odds are never mispriced on
  -- purpose (game-modes.md rule 3) — the edge is the only adjustment.
  v_odds := (1 - v_edge) / v_probability;

  v_won := CASE WHEN p_direction = 'under' THEN p_roll < p_threshold
                ELSE p_roll > p_threshold END;
  IF v_won THEN v_payout := floor(p_stake * v_odds)::bigint; END IF;

  -- The exact award, unrounded. 0.75 x stake x edge, plus on a win
  -- 0.30 x stake x edge x odds (currency-model.md).
  v_pearls_exact :=
    (0.75 * p_stake * v_edge)
    + CASE WHEN v_won THEN 0.30 * p_stake * v_edge * v_odds ELSE 0 END;

  SELECT * INTO v_player FROM public.players WHERE id = p_player_id FOR UPDATE;

  IF v_player.age_attested_at IS NULL THEN
    RAISE EXCEPTION 'player has not attested' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_player.shells_balance < p_stake THEN
    RAISE EXCEPTION 'insufficient shells' USING ERRCODE = 'check_violation';
  END IF;

  -- Add this bet's exact award to whatever fraction was carried, then split
  -- the pool into whole Pearls (which enter the ledger) and a remainder
  -- (which is carried again). Read under the row lock taken above, so two
  -- concurrent bets cannot both consume the same carry.
  v_pearls_pool := v_player.pearls_fraction + v_pearls_exact;
  v_pearls := floor(v_pearls_pool)::bigint;

  INSERT INTO public.bets
    (player_id, game, stake, decimal_odds, state, payout, pearls_awarded,
     content_version, settled_at)
  VALUES (p_player_id, 'dice', p_stake, v_odds, 'settled', v_payout, v_pearls,
          p_content_version, now())
  RETURNING id INTO v_bet_id;

  INSERT INTO public.bet_dice (bet_id, direction, threshold, roll, roll_max, won)
  VALUES (v_bet_id, p_direction, p_threshold, p_roll, p_roll_max, v_won);

  -- One movement per row.
  INSERT INTO public.ledger_entries (player_id, currency, amount, kind, ref_table, ref_id)
  VALUES (p_player_id, 'shells', -p_stake, 'bet_stake', 'bets', v_bet_id);

  IF v_payout > 0 THEN
    INSERT INTO public.ledger_entries (player_id, currency, amount, kind, ref_table, ref_id)
    VALUES (p_player_id, 'shells', v_payout, 'bet_payout', 'bets', v_bet_id);
  END IF;

  IF v_pearls > 0 THEN
    INSERT INTO public.ledger_entries (player_id, currency, amount, kind, ref_table, ref_id)
    VALUES (p_player_id, 'pearls', v_pearls, 'pearl_award', 'bets', v_bet_id);
  END IF;

  UPDATE public.players
     SET shells_balance = shells_balance - p_stake + v_payout,
         pearls_balance = pearls_balance + v_pearls,
         pearls_fraction = v_pearls_pool - v_pearls
   WHERE id = p_player_id;

  PERFORM public.assert_balance_matches_ledger(p_player_id);

  SELECT jsonb_build_object(
    'betId', v_bet_id, 'won', v_won, 'roll', p_roll, 'rollMax', p_roll_max,
    'threshold', p_threshold, 'direction', p_direction,
    'odds', round(v_odds, 4), 'stake', p_stake, 'payout', v_payout,
    'pearlsAwarded', v_pearls, 'pearlsPending', round(pearls_fraction, 3),
    'shells', shells_balance, 'pearls', pearls_balance
  ) INTO v_result FROM public.players WHERE id = p_player_id;

  INSERT INTO public.idempotency_keys (player_id, key, response)
  VALUES (p_player_id, p_idempotency_key, v_result);

  RETURN v_result;
END;
$$;
