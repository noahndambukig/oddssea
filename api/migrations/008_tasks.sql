-- 008 — the task faucet: three claim functions, no new tables.
--
-- Everything the task system needs to remember already exists: bets are
-- the evidence for conditions, task_claims is the dated once-per-day /
-- once-per-week record, one_time_claims is the once-ever record. Progress
-- is DERIVED — counted at claim time under the player lock — never stored,
-- so there is no counter to drift and place_dice_bet is untouched.
--
-- All three functions use the skeleton the crates milestone proved:
-- idempotency pre-check → player row lock → idempotency RE-CHECK under the
-- lock → attestation → condition → rows → balance assert → stored
-- response. Amounts and targets arrive as parameters from the shipping
-- copy (docs/01-game/data/tasks.json); no figure lives in this file.
--
-- Date semantics, stated on purpose: now() is TRANSACTION-START time, so
-- a claim's day is its arrival, not its lock-acquisition — the same
-- midnight behaviour claim_login_task has had since 003. The daily and
-- weekly functions verify the caller's date parameter against their own
-- derivation and reject a stale one as retryable; the handler recomputes
-- and retries once with the same idempotency key.

-- ------------------------------------------------------- claim_daily_task
--
-- first_bet (the constant daily task) and the drawn challenges. Draw
-- membership is checked ONLY for challenge:* keys — first_bet is
-- deliberately outside the draw and must never be rejected by it.
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
  IF p_task_key NOT IN ('first_bet', 'challenge:place_bets', 'challenge:win_bet') THEN
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

  -- The handler computed the draw for ITS view of today; if the day has
  -- rolled over since, both must be recomputed — the handler retries once
  -- on this exact message.
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
         AND payout > 0)
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

-- ------------------------------------------------------ claim_weekly_task
--
-- The week is ISO, Monday 00:00 UTC — date_trunc('week') is Monday-start
-- natively. claim_date = week_start makes task_claims' UNIQUE the
-- once-per-week rule with no new machinery. Weeklies are claimable only
-- during their own week.
CREATE OR REPLACE FUNCTION claim_weekly_task(
  p_player_id uuid,
  p_idempotency_key text,
  p_task_key text,
  p_week_start date,
  p_target integer,
  p_set_challenges integer,
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
  v_week date := date_trunc('week', now() AT TIME ZONE 'UTC')::date;
  v_met boolean;
  v_claim_id uuid;
  v_result jsonb;
BEGIN
  IF p_task_key NOT IN ('weekly:volume', 'weekly:consistency') THEN
    RAISE EXCEPTION 'unknown weekly task' USING ERRCODE = 'invalid_parameter_value';
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

  IF p_week_start <> v_week THEN
    RAISE EXCEPTION 'week rolled over' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF EXISTS (SELECT 1 FROM public.task_claims
              WHERE player_id = p_player_id AND task_key = p_task_key
                AND claim_date = v_week) THEN
    RAISE EXCEPTION 'already claimed this week' USING ERRCODE = 'unique_violation';
  END IF;

  IF p_task_key = 'weekly:volume' THEN
    v_met := (
      SELECT COUNT(*) FROM public.bets
       WHERE player_id = p_player_id
         AND (created_at AT TIME ZONE 'UTC')::date >= v_week
         AND (created_at AT TIME ZONE 'UTC')::date < v_week + 7) >= p_target;
  ELSE
    -- A qualifying day (the "daily set", derived from currency-model.md's
    -- own casual arithmetic): a login claim, a first_bet claim, and at
    -- least p_set_challenges challenge claims, all dated that day.
    -- task_claims IS the record — no draw recomputation needed.
    v_met := (
      SELECT COUNT(*) FROM (
        SELECT claim_date
          FROM public.task_claims
         WHERE player_id = p_player_id
           AND claim_date >= v_week AND claim_date < v_week + 7
         GROUP BY claim_date
        HAVING bool_or(task_key = 'login')
           AND bool_or(task_key = 'first_bet')
           AND COUNT(*) FILTER (WHERE task_key LIKE 'challenge:%') >= p_set_challenges
      ) AS qualifying_days) >= p_target;
  END IF;
  IF NOT v_met THEN
    RAISE EXCEPTION 'task not yet complete' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.task_claims (player_id, task_key, claim_date, amount)
  VALUES (p_player_id, p_task_key, v_week, p_amount)
  RETURNING id INTO v_claim_id;

  INSERT INTO public.ledger_entries (player_id, currency, amount, kind, ref_table, ref_id)
  VALUES (p_player_id, 'shells', p_amount, 'task_claim', 'task_claims', v_claim_id);

  UPDATE public.players
     SET shells_balance = shells_balance + p_amount
   WHERE id = p_player_id;

  PERFORM public.assert_balance_matches_ledger(p_player_id);

  SELECT jsonb_build_object(
    'taskKey', p_task_key, 'claimed', p_amount, 'weekStart', v_week,
    'shells', shells_balance, 'pearls', pearls_balance
  ) INTO v_result FROM public.players WHERE id = p_player_id;

  INSERT INTO public.idempotency_keys (player_id, key, response)
  VALUES (p_player_id, p_idempotency_key, v_result);

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------- claim_one_time_task
--
-- The tour is a CHAIN (tasks.md): each step's condition requires the
-- previous step's claim row, so a direct POST cannot take step 3 first.
-- first_bet:dice sits outside the chain.
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
  IF p_claim_key NOT IN ('tour:economy-intro', 'tour:starter-crates', 'tour:first-bet', 'first_bet:dice') THEN
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
    WHEN 'tour:first-bet' THEN
      EXISTS (SELECT 1 FROM public.one_time_claims
               WHERE player_id = p_player_id AND claim_key = 'tour:starter-crates')
      AND EXISTS (SELECT 1 FROM public.bets WHERE player_id = p_player_id)
    WHEN 'first_bet:dice' THEN
      EXISTS (SELECT 1 FROM public.bets WHERE player_id = p_player_id AND game = 'dice')
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
--
-- 007's GLOBAL default-privileges revoke means these functions are born
-- without PUBLIC execute — the adversarial suite verifies proacl rather
-- than assuming it (the 004 lesson).

GRANT EXECUTE ON FUNCTION claim_daily_task(uuid, text, text, date, jsonb, integer, bigint) TO oddssea_app;
GRANT EXECUTE ON FUNCTION claim_weekly_task(uuid, text, text, date, integer, integer, bigint) TO oddssea_app;
GRANT EXECUTE ON FUNCTION claim_one_time_task(uuid, text, text, bigint) TO oddssea_app;

-- The panel and progress reads: 004 granted bets but never task_claims.
GRANT SELECT ON public.task_claims TO oddssea_app;
