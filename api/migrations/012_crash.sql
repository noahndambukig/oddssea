-- 012 — crash: the first shared round (decisions/0028).
--
-- A round IS its UTC minute; the bust is HMAC(secret, round index)
-- pushed through the edge law. Node derives the bust (it holds the
-- secret) and passes it as a parameter; SQL owns the clock — the
-- betting window, the live multiplier and settlement eligibility are
-- all judged against now(), never against anything the caller claims.
-- Timing and pricing parameters arrive from the shipping copy
-- (docs/01-game/data/games.json) — no figure lives in this file.
--
-- The bet lifecycle is two-phase, exactly what 002 shipped for:
-- placement inserts state='open' and debits the stake in one
-- transaction; settlement (a live cashout, or maturity via the busts
-- map) is a second transaction that writes state='settled',
-- decimal_odds = the locked multiplier (NULL on a loss — "crash has no
-- price until the player cashes out"), payout, pearls, settled_at.
-- A round is settleable the moment it is DECIDED — its minute ended,
-- or its bust moment passed — because nothing after t_bust can change
-- any outcome.
--
-- Ties pay, in both verbs: the published law is P(B >= m), so
-- target = bust wins, and a live press landing in the bust's own cent
-- wins at it. A bust below the minimum cashout (1.00x) has no winners.

-- -------------------------------------------------------------- bet_crash
--
-- Per-game detail. round_index is the roll's SPACE (data-model rule 5):
-- the stored bust is only meaningful against the round it was drawn
-- for, and the audit recomputes HMAC(secret, round_index) to verify it.
-- bust stays NULL while the bet is open — an open row must not contain
-- the answer.
CREATE TABLE bet_crash (
  bet_id        uuid PRIMARY KEY REFERENCES bets(id),
  round_index   bigint NOT NULL,
  auto_target   numeric(10, 2),
  bust          numeric(10, 2)
);

-- The feed reads by round (current + previous), across players.
CREATE INDEX bet_crash_round ON bet_crash (round_index);

-- -------------------------------------------------------- crash_settle_one
--
-- The single settlement write path, shared by all three verbs. PRIVATE:
-- no grant, so the app role cannot call it — only the SECURITY DEFINER
-- functions below reach it, and they hold the player row lock before
-- calling (that lock is this function's concurrency contract).
--
-- p_win_multiplier NULL means loss. Pearls follow currency-model.md:
-- the base share always (a settled wager is a wager), the win share
-- with odds = the locked multiplier, pooled through pearls_fraction
-- per bet exactly as if the bets had settled in separate calls.
CREATE OR REPLACE FUNCTION crash_settle_one(
  p_player_id uuid,
  p_bet_id uuid,
  p_stake bigint,
  p_bust numeric,
  p_win_multiplier numeric,
  p_edge numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_payout bigint := 0;
  v_pearls_exact numeric;
  v_pearls_pool numeric;
  v_pearls bigint;
BEGIN
  IF p_win_multiplier IS NOT NULL THEN
    v_payout := floor(p_stake * p_win_multiplier)::bigint;
  END IF;

  v_pearls_exact :=
    (0.75 * p_stake * p_edge)
    + CASE WHEN p_win_multiplier IS NOT NULL
           THEN 0.30 * p_stake * p_edge * p_win_multiplier
           ELSE 0 END;

  SELECT pearls_fraction + v_pearls_exact INTO v_pearls_pool
    FROM public.players WHERE id = p_player_id;
  v_pearls := floor(v_pearls_pool)::bigint;

  UPDATE public.bets
     SET state = 'settled',
         decimal_odds = p_win_multiplier,
         payout = v_payout,
         pearls_awarded = v_pearls,
         settled_at = now()
   WHERE id = p_bet_id;

  UPDATE public.bet_crash SET bust = p_bust WHERE bet_id = p_bet_id;

  -- A partial return is a payout row, not a loss annotation; zero pays
  -- nothing and writes nothing (the plinko rule).
  IF v_payout > 0 THEN
    INSERT INTO public.ledger_entries (player_id, currency, amount, kind, ref_table, ref_id)
    VALUES (p_player_id, 'shells', v_payout, 'bet_payout', 'bets', p_bet_id);
  END IF;

  IF v_pearls > 0 THEN
    INSERT INTO public.ledger_entries (player_id, currency, amount, kind, ref_table, ref_id)
    VALUES (p_player_id, 'pearls', v_pearls, 'pearl_award', 'bets', p_bet_id);
  END IF;

  UPDATE public.players
     SET shells_balance = shells_balance + v_payout,
         pearls_balance = pearls_balance + v_pearls,
         pearls_fraction = v_pearls_pool - v_pearls
   WHERE id = p_player_id;

  RETURN jsonb_build_object(
    'betId', p_bet_id, 'bust', p_bust,
    'multiplier', p_win_multiplier, 'won', p_win_multiplier IS NOT NULL,
    'stake', p_stake, 'payout', v_payout, 'pearlsAwarded', v_pearls
  );
END;
$$;

-- -------------------------------------------------- settle_map_and_report
--
-- The shared maturity pass used by settle_crash_bets and placement's
-- defensive settle. Walks my OPEN crash bets; settles every one whose
-- round is DECIDED and whose bust is present in the map; reports the
-- decided-but-unrepresented rounds so the handler can follow up with a
-- refreshed map (always via the keyless settle call — a keyed place
-- retry would short-circuit at its stored response). PRIVATE, same
-- contract as crash_settle_one: caller holds the player row lock.
CREATE OR REPLACE FUNCTION crash_settle_matured(
  p_player_id uuid,
  p_busts jsonb,
  p_edge numeric,
  p_betting_s integer,
  p_double_s integer,
  p_period_s integer
)
RETURNS jsonb  -- { "skipped": [round_index, ...] }
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_epoch numeric := extract(epoch FROM now());
  v_current bigint;
  v_elapsed numeric;
  v_bet record;
  v_bust_txt text;
  v_bust numeric;
  v_decided boolean;
  v_skipped jsonb := '[]'::jsonb;
BEGIN
  v_current := floor(v_epoch / p_period_s)::bigint;
  v_elapsed := v_epoch - v_current * p_period_s;

  FOR v_bet IN
    SELECT b.id, b.stake, bc.round_index, bc.auto_target
      FROM public.bets b
      JOIN public.bet_crash bc ON bc.bet_id = b.id
     WHERE b.player_id = p_player_id AND b.state = 'open'
     ORDER BY bc.round_index
  LOOP
    v_bust_txt := p_busts ->> (v_bet.round_index::text);

    IF v_bust_txt IS NULL THEN
      -- Decided by the calendar but missing from the map: the pre-read
      -- raced the minute roll. Report it; the future never crosses the
      -- wire, so SQL cannot derive the missing bust itself.
      IF v_bet.round_index < v_current THEN
        v_skipped := v_skipped || to_jsonb(v_bet.round_index);
      END IF;
      CONTINUE;
    END IF;

    v_bust := v_bust_txt::numeric;

    -- Decided: the minute ended, or the bust moment passed on OUR
    -- clock. log(2, bust) is 0 at an instant 1.00x bust — decided the
    -- moment the flight starts.
    v_decided := v_bet.round_index < v_current
      OR (v_bet.round_index = v_current
          AND v_elapsed >= p_betting_s + p_double_s * log(2::numeric, v_bust));

    IF v_decided THEN
      -- Ties pay: auto_target = bust wins at the target.
      PERFORM public.crash_settle_one(
        p_player_id, v_bet.id, v_bet.stake, v_bust,
        CASE WHEN v_bet.auto_target IS NOT NULL AND v_bet.auto_target <= v_bust
             THEN v_bet.auto_target ELSE NULL END,
        p_edge);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('skipped', v_skipped);
END;
$$;

-- --------------------------------------------------------- place_crash_bet
CREATE OR REPLACE FUNCTION place_crash_bet(
  p_player_id uuid,
  p_idempotency_key text,
  p_stake bigint,
  p_auto_target numeric,
  p_busts jsonb,
  p_edge numeric,
  p_min_stake bigint,
  p_min_target numeric,
  p_cap numeric,
  p_betting_s integer,
  p_double_s integer,
  p_period_s integer,
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
  v_epoch numeric;
  v_current bigint;
  v_elapsed numeric;
  v_skipped jsonb;
  v_bet_id uuid;
  v_result jsonb;
BEGIN
  SELECT response INTO v_stored
    FROM public.idempotency_keys
   WHERE player_id = p_player_id AND key = p_idempotency_key;
  IF FOUND THEN RETURN v_stored; END IF;

  IF p_stake < p_min_stake THEN
    RAISE EXCEPTION 'stake below minimum of %', p_min_stake USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_auto_target IS NOT NULL THEN
    -- The cent grid is load-bearing: numeric(10,2) would silently ROUND
    -- an off-grid target (1.019 -> 1.02), changing the player's request,
    -- and the pricing law is only exact on the grid.
    IF p_auto_target * 100 <> trunc(p_auto_target * 100) THEN
      RAISE EXCEPTION 'target must be on the cent grid' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF p_auto_target < p_min_target OR p_auto_target > p_cap THEN
      RAISE EXCEPTION 'target outside [%, %]', p_min_target, p_cap USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END IF;

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

  -- Defensive settle: stragglers from earlier rounds settle inside the
  -- placement transaction, so one player's history stays linear. During
  -- a betting window every open bet from an earlier round is decided by
  -- the calendar, so the map either covers it or it is reported.
  v_skipped := (public.crash_settle_matured(
    p_player_id, p_busts, p_edge, p_betting_s, p_double_s, p_period_s)) -> 'skipped';

  -- The window belongs to now() — SQL is the authority on the round.
  v_epoch := extract(epoch FROM now());
  v_current := floor(v_epoch / p_period_s)::bigint;
  v_elapsed := v_epoch - v_current * p_period_s;
  IF v_elapsed >= p_betting_s THEN
    RAISE EXCEPTION 'betting window closed' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bets b
      JOIN public.bet_crash bc ON bc.bet_id = b.id
     WHERE b.player_id = p_player_id AND b.state = 'open'
       AND bc.round_index = v_current
  ) THEN
    RAISE EXCEPTION 'already riding this round' USING ERRCODE = 'unique_violation';
  END IF;

  IF v_player.shells_balance < p_stake THEN
    RAISE EXCEPTION 'insufficient shells' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.bets
    (player_id, game, stake, decimal_odds, state, payout, pearls_awarded,
     content_version)
  VALUES (p_player_id, 'crash', p_stake, NULL, 'open', 0, 0, p_content_version)
  RETURNING id INTO v_bet_id;

  INSERT INTO public.bet_crash (bet_id, round_index, auto_target)
  VALUES (v_bet_id, v_current, p_auto_target);

  INSERT INTO public.ledger_entries (player_id, currency, amount, kind, ref_table, ref_id)
  VALUES (p_player_id, 'shells', -p_stake, 'bet_stake', 'bets', v_bet_id);

  UPDATE public.players
     SET shells_balance = shells_balance - p_stake
   WHERE id = p_player_id;

  PERFORM public.assert_balance_matches_ledger(p_player_id);

  SELECT jsonb_build_object(
    'betId', v_bet_id, 'roundIndex', v_current, 'autoTarget', p_auto_target,
    'stake', p_stake, 'skipped', v_skipped,
    'shells', shells_balance, 'pearls', pearls_balance
  ) INTO v_result FROM public.players WHERE id = p_player_id;

  INSERT INTO public.idempotency_keys (player_id, key, response)
  VALUES (p_player_id, p_idempotency_key, v_result);

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------- cashout_crash_bet
--
-- The live verb, adjudicated by the server clock: the multiplier is
-- whatever the curve reads WHEN THE REQUEST ARRIVES — latency is the
-- player's risk, as in real crash. Clamped to the cap so a capped round
-- resolves as a tie at the cap (ties pay). No attestation check: this
-- settles an existing wager, it does not place one.
CREATE OR REPLACE FUNCTION cashout_crash_bet(
  p_player_id uuid,
  p_idempotency_key text,
  p_bet_id uuid,
  p_bust numeric,
  p_edge numeric,
  p_min_target numeric,
  p_cap numeric,
  p_betting_s integer,
  p_double_s integer,
  p_period_s integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_stored jsonb;
  v_bet record;
  v_epoch numeric;
  v_current bigint;
  v_elapsed numeric;
  v_m_now numeric;
  v_settled jsonb;
  v_result jsonb;
BEGIN
  SELECT response INTO v_stored
    FROM public.idempotency_keys
   WHERE player_id = p_player_id AND key = p_idempotency_key;
  IF FOUND THEN RETURN v_stored; END IF;

  PERFORM 1 FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown player' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT response INTO v_stored
    FROM public.idempotency_keys
   WHERE player_id = p_player_id AND key = p_idempotency_key;
  IF FOUND THEN RETURN v_stored; END IF;

  SELECT b.id, b.stake, bc.round_index INTO v_bet
    FROM public.bets b
    JOIN public.bet_crash bc ON bc.bet_id = b.id
   WHERE b.id = p_bet_id AND b.player_id = p_player_id
     AND b.game = 'crash' AND b.state = 'open';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bet not open' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_epoch := extract(epoch FROM now());
  v_current := floor(v_epoch / p_period_s)::bigint;
  v_elapsed := v_epoch - v_current * p_period_s;

  IF v_bet.round_index <> v_current THEN
    RAISE EXCEPTION 'round over — settle instead' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_elapsed < p_betting_s THEN
    RAISE EXCEPTION 'round not flying yet' USING ERRCODE = 'check_violation';
  END IF;

  v_m_now := least(p_cap,
    floor(power(2::numeric, (v_elapsed - p_betting_s) / p_double_s) * 100) / 100);

  IF p_bust < p_min_target THEN
    -- The round died before a legal cashout existed (an instant 1.00x
    -- bust): every press is a loss, never a "too early" — otherwise the
    -- reject path would let the player wait out a known-dead round.
    v_settled := public.crash_settle_one(
      p_player_id, v_bet.id, v_bet.stake, p_bust, NULL, p_edge);
  ELSIF v_m_now > p_bust THEN
    -- The press was late: the curve passed the bust before the request
    -- arrived. Loss by arithmetic, not by feed.
    v_settled := public.crash_settle_one(
      p_player_id, v_bet.id, v_bet.stake, p_bust, NULL, p_edge);
  ELSIF v_m_now < p_min_target THEN
    RAISE EXCEPTION 'too early to cash out' USING ERRCODE = 'check_violation';
  ELSE
    -- m_now <= bust: the cashout stands. The bust cent itself pays —
    -- ties win in both verbs, because the published law is P(B >= m).
    v_settled := public.crash_settle_one(
      p_player_id, v_bet.id, v_bet.stake, p_bust, v_m_now, p_edge);
  END IF;

  PERFORM public.assert_balance_matches_ledger(p_player_id);

  SELECT v_settled || jsonb_build_object(
    'roundIndex', v_bet.round_index,
    'shells', shells_balance, 'pearls', pearls_balance,
    'pearlsPending', round(pearls_fraction, 3)
  ) INTO v_result FROM public.players WHERE id = p_player_id;

  INSERT INTO public.idempotency_keys (player_id, key, response)
  VALUES (p_player_id, p_idempotency_key, v_result);

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------- settle_crash_bets
--
-- The maturity verb. KEYLESS on purpose: every outcome it writes was
-- decided before the call (natural idempotency — a second call finds
-- nothing open), and its response is DERIVED STATE rather than an event
-- receipt: my settled crash bets from the last 5 rounds plus balances,
-- so a retry after an ambiguous failure reproduces the outcomes instead
-- of returning an empty receipt. Double-pay was never possible — the
-- open->settled transition under the player lock is the idempotency.
CREATE OR REPLACE FUNCTION settle_crash_bets(
  p_player_id uuid,
  p_busts jsonb,
  p_edge numeric,
  p_betting_s integer,
  p_double_s integer,
  p_period_s integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_current bigint;
  v_skipped jsonb;
  v_recent jsonb;
  v_result jsonb;
BEGIN
  PERFORM 1 FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown player' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_skipped := (public.crash_settle_matured(
    p_player_id, p_busts, p_edge, p_betting_s, p_double_s, p_period_s)) -> 'skipped';

  PERFORM public.assert_balance_matches_ledger(p_player_id);

  v_current := floor(extract(epoch FROM now()) / p_period_s)::bigint;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'betId', b.id, 'roundIndex', bc.round_index,
      'autoTarget', bc.auto_target, 'bust', bc.bust,
      'multiplier', b.decimal_odds, 'won', b.decimal_odds IS NOT NULL,
      'stake', b.stake, 'payout', b.payout, 'pearlsAwarded', b.pearls_awarded
    ) ORDER BY bc.round_index DESC), '[]'::jsonb) INTO v_recent
    FROM public.bets b
    JOIN public.bet_crash bc ON bc.bet_id = b.id
   WHERE b.player_id = p_player_id AND b.state = 'settled'
     AND bc.round_index >= v_current - 5;

  SELECT jsonb_build_object(
    'recent', v_recent, 'skipped', v_skipped,
    'shells', shells_balance, 'pearls', pearls_balance,
    'pearlsPending', round(pearls_fraction, 3)
  ) INTO v_result FROM public.players WHERE id = p_player_id;

  RETURN v_result;
END;
$$;

-- ---------------------------------- claim_one_time_task, + first_bet:crash
--
-- Identical to 011 plus the new key and its condition. Expand-only.
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
                         'first_bet:crash', 'first_equip') THEN
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
    WHEN 'first_bet:crash' THEN
      EXISTS (SELECT 1 FROM public.bets WHERE player_id = p_player_id AND game = 'crash')
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
--
-- The two private helpers get NO grant: 007's global default-privilege
-- revoke means an ungranted function is unreachable by the app role,
-- and only the SECURITY DEFINER verbs below call them.

GRANT EXECUTE ON FUNCTION place_crash_bet(uuid, text, bigint, numeric, jsonb, numeric, bigint, numeric, numeric, integer, integer, integer, text) TO oddssea_app;
GRANT EXECUTE ON FUNCTION cashout_crash_bet(uuid, text, uuid, numeric, numeric, numeric, numeric, integer, integer, integer) TO oddssea_app;
GRANT EXECUTE ON FUNCTION settle_crash_bets(uuid, jsonb, numeric, integer, integer, integer) TO oddssea_app;
GRANT SELECT ON public.bet_crash TO oddssea_app;
