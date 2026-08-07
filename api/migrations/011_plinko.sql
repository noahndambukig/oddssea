-- 011 — plinko: the second game.
--
-- The roll is one integer whose bits are the ball's left/rights: Node
-- pre-rolls path ∈ [0, 2^rows) with a CSPRNG, SQL derives the bucket as
-- the popcount and pays the profile's multiplier at that index. Path and
-- rows are stored (data-model rule 5 — the roll and its space); the
-- bucket is DERIVED here, never trusted from the caller. Multipliers,
-- edge and minimum stake arrive as parameters from the shipping copy
-- (docs/01-game/data/games.json) — no figure lives in this file.
--
-- Also here: the win-a-bet predicate fix. `payout > 0` meant "won" only
-- while no game paid partial returns — a 0.4× plinko bucket would have
-- completed the outcome challenge on a loss. The predicate becomes
-- `payout > stake` (profit is a win) in claim_daily_task, which also
-- gains the play-two-games challenge condition now that a second game
-- exists. claim_one_time_task gains first_bet:plinko. Both replacements
-- are otherwise identical to their predecessors.

-- ------------------------------------------------------------- bet_plinko
--
-- Per-game detail, the bet_dice shape: the path is only meaningful
-- against its row count, and the multiplier is denormalised so the row
-- reads standalone in the audit trail.
CREATE TABLE bet_plinko (
  bet_id        uuid PRIMARY KEY REFERENCES bets(id),
  risk          text NOT NULL CHECK (risk IN ('low', 'mid', 'high')),
  rows          integer NOT NULL,
  path          integer NOT NULL,
  bucket        integer NOT NULL,
  multiplier    numeric(10, 2) NOT NULL
);

-- --------------------------------------------------------- place_plinko_bet
CREATE OR REPLACE FUNCTION place_plinko_bet(
  p_player_id uuid,
  p_idempotency_key text,
  p_stake bigint,
  p_risk text,
  p_rows integer,
  p_path integer,
  p_multipliers jsonb,
  p_edge numeric,
  p_min_stake bigint,
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
  v_bucket integer;
  v_multiplier numeric;
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

  IF p_risk NOT IN ('low', 'mid', 'high') THEN
    RAISE EXCEPTION 'unknown risk profile' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_rows < 4 OR p_rows > 30 THEN
    RAISE EXCEPTION 'rows out of range' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_path < 0 OR p_path >= (1::bigint << p_rows) THEN
    RAISE EXCEPTION 'path outside its space' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF jsonb_array_length(p_multipliers) <> p_rows + 1 THEN
    RAISE EXCEPTION 'multiplier table does not match rows' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_stake < p_min_stake THEN
    RAISE EXCEPTION 'stake below minimum of %', p_min_stake USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- The bucket is the popcount of the path: each set bit is one bounce
  -- right. Fixed-width cast — an integer's bare bit cast varies by width.
  v_bucket := bit_count(p_path::bit(32));
  v_multiplier := (p_multipliers->>v_bucket)::numeric;
  v_won := v_multiplier > 1;
  v_payout := floor(p_stake * v_multiplier)::bigint;

  -- Pearl award (currency-model.md): the base always; the win share with
  -- odds = the bucket multiplier — the winning outcome's decimal payout,
  -- exactly bankroll.py's model.
  v_pearls_exact :=
    (0.75 * p_stake * p_edge)
    + CASE WHEN v_won THEN 0.30 * p_stake * p_edge * v_multiplier ELSE 0 END;

  SELECT * INTO v_player FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown player' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT response INTO v_stored
    FROM public.idempotency_keys
   WHERE player_id = p_player_id AND key = p_idempotency_key;
  IF FOUND THEN RETURN v_stored; END IF;

  IF v_player.age_attested_at IS NULL THEN
    RAISE EXCEPTION 'player has not attested' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_player.shells_balance < p_stake THEN
    RAISE EXCEPTION 'insufficient shells' USING ERRCODE = 'check_violation';
  END IF;

  v_pearls_pool := v_player.pearls_fraction + v_pearls_exact;
  v_pearls := floor(v_pearls_pool)::bigint;

  INSERT INTO public.bets
    (player_id, game, stake, decimal_odds, state, payout, pearls_awarded,
     content_version, settled_at)
  VALUES (p_player_id, 'plinko', p_stake, v_multiplier, 'settled', v_payout, v_pearls,
          p_content_version, now())
  RETURNING id INTO v_bet_id;

  INSERT INTO public.bet_plinko (bet_id, risk, rows, path, bucket, multiplier)
  VALUES (v_bet_id, p_risk, p_rows, p_path, v_bucket, v_multiplier);

  INSERT INTO public.ledger_entries (player_id, currency, amount, kind, ref_table, ref_id)
  VALUES (p_player_id, 'shells', -p_stake, 'bet_stake', 'bets', v_bet_id);

  -- A sub-1 bucket is a partial RETURN, and a return is a payout row —
  -- not a loss annotation. Zero pays nothing and writes nothing.
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
    'betId', v_bet_id, 'risk', p_risk, 'rows', p_rows, 'path', p_path,
    'bucket', v_bucket, 'multiplier', v_multiplier, 'won', v_won,
    'stake', p_stake, 'payout', v_payout,
    'pearlsAwarded', v_pearls, 'pearlsPending', round(pearls_fraction, 3),
    'shells', shells_balance, 'pearls', pearls_balance
  ) INTO v_result FROM public.players WHERE id = p_player_id;

  INSERT INTO public.idempotency_keys (player_id, key, response)
  VALUES (p_player_id, p_idempotency_key, v_result);

  RETURN v_result;
END;
$$;

-- ------------------------------------------- claim_daily_task, two changes
--
-- 1. challenge:play_two_games — buildable now that a second game exists;
--    the pool entry activates via available_from (decisions/0024).
-- 2. THE win predicate: payout > stake, not payout > 0 — profit is a
--    win. Identical to 008 otherwise.
CREATE OR REPLACE FUNCTION claim_daily_task(
  p_player_id uuid,
  p_idempotency_key text,
  p_task_key text,
  p_claim_date date,
  p_draw jsonb,
  p_target integer,
  p_amount bigint
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
  v_met boolean;
  v_claim_id uuid;
  v_result jsonb;
BEGIN
  IF p_task_key NOT IN ('first_bet', 'challenge:place_bets', 'challenge:win_bet',
                        'challenge:play_two_games') THEN
    RAISE EXCEPTION 'unknown daily task' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT response INTO v_stored
    FROM public.idempotency_keys
   WHERE player_id = p_player_id AND key = p_idempotency_key;
  IF FOUND THEN RETURN v_stored; END IF;

  SELECT * INTO v_player FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown player' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT response INTO v_stored
    FROM public.idempotency_keys
   WHERE player_id = p_player_id AND key = p_idempotency_key;
  IF FOUND THEN RETURN v_stored; END IF;

  IF v_player.age_attested_at IS NULL THEN
    RAISE EXCEPTION 'player has not attested' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_claim_date <> v_today THEN
    RAISE EXCEPTION 'day rolled over' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_task_key LIKE 'challenge:%' AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(p_draw) AS t(key) WHERE t.key = p_task_key
  ) THEN
    RAISE EXCEPTION 'not in today''s draw' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF EXISTS (SELECT 1 FROM public.task_claims
              WHERE player_id = p_player_id AND task_key = p_task_key
                AND claim_date = v_today) THEN
    RAISE EXCEPTION 'already claimed today' USING ERRCODE = 'unique_violation';
  END IF;

  v_met := CASE p_task_key
    WHEN 'first_bet' THEN EXISTS (
      SELECT 1 FROM public.bets
       WHERE player_id = p_player_id
         AND (created_at AT TIME ZONE 'UTC')::date = v_today)
    WHEN 'challenge:place_bets' THEN (
      SELECT COUNT(*) FROM public.bets
       WHERE player_id = p_player_id
         AND (created_at AT TIME ZONE 'UTC')::date = v_today) >= p_target
    WHEN 'challenge:win_bet' THEN EXISTS (
      SELECT 1 FROM public.bets
       WHERE player_id = p_player_id
         AND (created_at AT TIME ZONE 'UTC')::date = v_today
         AND payout > stake)
    WHEN 'challenge:play_two_games' THEN (
      SELECT COUNT(DISTINCT game) FROM public.bets
       WHERE player_id = p_player_id
         AND (created_at AT TIME ZONE 'UTC')::date = v_today) >= p_target
  END;
  IF NOT v_met THEN
    RAISE EXCEPTION 'task not yet complete' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.task_claims (player_id, task_key, claim_date, amount)
  VALUES (p_player_id, p_task_key, v_today, p_amount)
  RETURNING id INTO v_claim_id;

  INSERT INTO public.ledger_entries (player_id, currency, amount, kind, ref_table, ref_id)
  VALUES (p_player_id, 'shells', p_amount, 'task_claim', 'task_claims', v_claim_id);

  UPDATE public.players
     SET shells_balance = shells_balance + p_amount
   WHERE id = p_player_id;

  PERFORM public.assert_balance_matches_ledger(p_player_id);

  SELECT jsonb_build_object(
    'taskKey', p_task_key, 'claimed', p_amount, 'claimDate', v_today,
    'shells', shells_balance, 'pearls', pearls_balance
  ) INTO v_result FROM public.players WHERE id = p_player_id;

  INSERT INTO public.idempotency_keys (player_id, key, response)
  VALUES (p_player_id, p_idempotency_key, v_result);

  RETURN v_result;
END;
$$;

-- ---------------------------------- claim_one_time_task, + first_bet:plinko
--
-- Identical to 010 plus the new key and its condition.
CREATE OR REPLACE FUNCTION claim_one_time_task(
  p_player_id uuid,
  p_idempotency_key text,
  p_claim_key text,
  p_amount bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_stored jsonb;
  v_player public.players%ROWTYPE;
  v_met boolean;
  v_claim_id uuid;
  v_result jsonb;
BEGIN
  IF p_claim_key NOT IN ('tour:economy-intro', 'tour:starter-crates', 'tour:equip',
                         'tour:first-bet', 'first_bet:dice', 'first_bet:plinko',
                         'first_equip') THEN
    RAISE EXCEPTION 'unknown one-time task' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT response INTO v_stored
    FROM public.idempotency_keys
   WHERE player_id = p_player_id AND key = p_idempotency_key;
  IF FOUND THEN RETURN v_stored; END IF;

  SELECT * INTO v_player FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown player' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT response INTO v_stored
    FROM public.idempotency_keys
   WHERE player_id = p_player_id AND key = p_idempotency_key;
  IF FOUND THEN RETURN v_stored; END IF;

  IF v_player.age_attested_at IS NULL THEN
    RAISE EXCEPTION 'player has not attested' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF EXISTS (SELECT 1 FROM public.one_time_claims
              WHERE player_id = p_player_id AND claim_key = p_claim_key) THEN
    RAISE EXCEPTION 'already claimed' USING ERRCODE = 'unique_violation';
  END IF;

  v_met := CASE p_claim_key
    WHEN 'tour:economy-intro' THEN true
    WHEN 'tour:starter-crates' THEN
      EXISTS (SELECT 1 FROM public.one_time_claims
               WHERE player_id = p_player_id AND claim_key = 'tour:economy-intro')
      AND EXISTS (SELECT 1 FROM public.one_time_claims
               WHERE player_id = p_player_id AND claim_key = 'starter_crates')
    WHEN 'tour:equip' THEN
      EXISTS (SELECT 1 FROM public.one_time_claims
               WHERE player_id = p_player_id AND claim_key = 'tour:starter-crates')
      AND v_player.first_equipped_at IS NOT NULL
    WHEN 'tour:first-bet' THEN
      EXISTS (SELECT 1 FROM public.one_time_claims
               WHERE player_id = p_player_id AND claim_key = 'tour:equip')
      AND EXISTS (SELECT 1 FROM public.bets WHERE player_id = p_player_id)
    WHEN 'first_bet:dice' THEN
      EXISTS (SELECT 1 FROM public.bets WHERE player_id = p_player_id AND game = 'dice')
    WHEN 'first_bet:plinko' THEN
      EXISTS (SELECT 1 FROM public.bets WHERE player_id = p_player_id AND game = 'plinko')
    WHEN 'first_equip' THEN
      v_player.first_equipped_at IS NOT NULL
  END;
  IF NOT v_met THEN
    RAISE EXCEPTION 'task not yet complete' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.one_time_claims (player_id, claim_key, amount)
  VALUES (p_player_id, p_claim_key, p_amount)
  RETURNING id INTO v_claim_id;

  INSERT INTO public.ledger_entries (player_id, currency, amount, kind, ref_table, ref_id)
  VALUES (p_player_id, 'shells', p_amount, 'task_claim', 'one_time_claims', v_claim_id);

  UPDATE public.players
     SET shells_balance = shells_balance + p_amount
   WHERE id = p_player_id;

  PERFORM public.assert_balance_matches_ledger(p_player_id);

  SELECT jsonb_build_object(
    'taskKey', p_claim_key, 'claimed', p_amount,
    'shells', shells_balance, 'pearls', pearls_balance
  ) INTO v_result FROM public.players WHERE id = p_player_id;

  INSERT INTO public.idempotency_keys (player_id, key, response)
  VALUES (p_player_id, p_idempotency_key, v_result);

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------------- grants

GRANT EXECUTE ON FUNCTION place_plinko_bet(uuid, text, bigint, text, integer, integer, jsonb, numeric, bigint, text) TO oddssea_app;
GRANT SELECT ON public.bet_plinko TO oddssea_app;
