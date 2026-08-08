-- 013 — roulette: the shared table, and the rule-of-three extraction
-- (decisions/0029).
--
-- Rounds are arithmetic, the 0028 doctrine at a 40-second period: the
-- pocket is HMAC-derived by Node (domain-separated from crash under
-- the same retained secret) and passed as a parameter; SQL owns the
-- clock — the betting window and settlement eligibility are judged
-- against now(). The spin moment is FIXED at betting_seconds, so
-- unlike crash no per-round bust-time arithmetic exists here.
--
-- THE EXTRACTION: settle_round_bet is the shared ledger write-path the
-- rule of three earned — the bets-row transition, payout and pearl
-- ledger rows, balances and the fraction carry. Used by roulette now
-- and races later. Dice, plinko and crash are deliberately NOT
-- retouched; their settle paths are shipped, verified history.
--
-- Many bets, one outcome: a player stacks chips freely (no
-- one-per-round rule — that was crash's shape, not roulette's), and
-- settlement sweeps them in (round_index, bet_id) order — bet ids are
-- UUIDv7, so within a round that is creation order, which makes the
-- pearl fraction-carry sequence exactly reproducible by the audit.

-- ------------------------------------------------------------ bet_roulette
--
-- round_index is the roll's space (data-model rule 5); pocket stays
-- NULL while the bet is open — an open row must not contain the
-- answer. selection is the canonical (sorted) covered-numbers array;
-- legality lives at the handler's derived registry, shape is checked
-- here, and the audit re-derives both (the plinko trust split).
CREATE TABLE bet_roulette (
  bet_id        uuid PRIMARY KEY REFERENCES bets(id),
  round_index   bigint NOT NULL,
  bet_type      text NOT NULL CHECK (bet_type IN
    ('straight','split','street','corner','six_line','dozen','column',
     'red','black','odd','even','high','low')),
  selection     jsonb NOT NULL,
  pocket        smallint
);

CREATE INDEX bet_roulette_round ON bet_roulette (round_index);

-- --------------------------------------------------------- settle_round_bet
--
-- THE SHARED SETTLEMENT CORE (private: no grant; reachable only from
-- the SECURITY DEFINER verbs, which hold the player row lock — that
-- lock is this function's concurrency contract).
--
-- Game-agnostic on purpose: it touches bets, ledger_entries and
-- players only. Game detail rows (the pocket, a race's finish order)
-- are the caller's business. p_decimal_odds NULL means "leave the
-- stored price alone" — roulette writes its price at placement.
CREATE OR REPLACE FUNCTION settle_round_bet(
  p_player_id uuid,
  p_bet_id uuid,
  p_decimal_odds numeric,
  p_payout bigint,
  p_pearls_exact numeric
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_pearls_pool numeric;
  v_pearls bigint;
BEGIN
  SELECT pearls_fraction + p_pearls_exact INTO v_pearls_pool
    FROM public.players WHERE id = p_player_id;
  v_pearls := floor(v_pearls_pool)::bigint;

  UPDATE public.bets
     SET state = 'settled',
         decimal_odds = coalesce(p_decimal_odds, decimal_odds),
         payout = p_payout,
         pearls_awarded = v_pearls,
         settled_at = now()
   WHERE id = p_bet_id;

  IF p_payout > 0 THEN
    INSERT INTO public.ledger_entries (player_id, currency, amount, kind, ref_table, ref_id)
    VALUES (p_player_id, 'shells', p_payout, 'bet_payout', 'bets', p_bet_id);
  END IF;

  IF v_pearls > 0 THEN
    INSERT INTO public.ledger_entries (player_id, currency, amount, kind, ref_table, ref_id)
    VALUES (p_player_id, 'pearls', v_pearls, 'pearl_award', 'bets', p_bet_id);
  END IF;

  UPDATE public.players
     SET shells_balance = shells_balance + p_payout,
         pearls_balance = pearls_balance + v_pearls,
         pearls_fraction = v_pearls_pool - v_pearls
   WHERE id = p_player_id;
END;
$$;

-- ------------------------------------------------- roulette_settle_matured
--
-- The maturity sweep (private, caller holds the lock): settles my open
-- roulette bets whose round is DECIDED — its period elapsed, or the
-- current round's spin moment passed — and whose pocket is present in
-- the map. Missing decided rounds are reported for the handler's
-- keyless follow-up. ORDER BY round_index, bet_id: the carry makes
-- settlement order-sensitive, and UUIDv7 bet ids make this creation
-- order — total, documented, audit-reproducible.
CREATE OR REPLACE FUNCTION roulette_settle_matured(
  p_player_id uuid,
  p_pockets jsonb,
  p_edge numeric,
  p_betting_s integer,
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
  v_pocket_txt text;
  v_pocket integer;
  v_decided boolean;
  v_won boolean;
  v_coverage integer;
  v_payout bigint;
  v_pearls_exact numeric;
  v_skipped jsonb := '[]'::jsonb;
BEGIN
  v_current := floor(v_epoch / p_period_s)::bigint;
  v_elapsed := v_epoch - v_current * p_period_s;

  FOR v_bet IN
    SELECT b.id, b.stake, br.round_index, br.selection
      FROM public.bets b
      JOIN public.bet_roulette br ON br.bet_id = b.id
     WHERE b.player_id = p_player_id AND b.state = 'open'
     ORDER BY br.round_index, b.id
  LOOP
    v_decided := v_bet.round_index < v_current
      OR (v_bet.round_index = v_current AND v_elapsed >= p_betting_s);
    IF NOT v_decided THEN CONTINUE; END IF;

    v_pocket_txt := p_pockets ->> (v_bet.round_index::text);
    IF v_pocket_txt IS NULL THEN
      v_skipped := v_skipped || to_jsonb(v_bet.round_index);
      CONTINUE;
    END IF;
    v_pocket := v_pocket_txt::integer;

    v_won := v_bet.selection @> to_jsonb(v_pocket);
    v_coverage := jsonb_array_length(v_bet.selection);
    v_payout := CASE WHEN v_won THEN v_bet.stake * 36 / v_coverage ELSE 0 END;
    v_pearls_exact :=
      (0.75 * v_bet.stake * p_edge)
      + CASE WHEN v_won THEN 0.30 * v_bet.stake * p_edge * (36::numeric / v_coverage) ELSE 0 END;

    UPDATE public.bet_roulette SET pocket = v_pocket WHERE bet_id = v_bet.id;
    PERFORM public.settle_round_bet(p_player_id, v_bet.id, NULL, v_payout, v_pearls_exact);
  END LOOP;

  RETURN jsonb_build_object('skipped', v_skipped);
END;
$$;

-- -------------------------------------------------------- place_roulette_bet
CREATE OR REPLACE FUNCTION place_roulette_bet(
  p_player_id uuid,
  p_idempotency_key text,
  p_stake bigint,
  p_bet_type text,
  p_selection jsonb,
  p_coverage integer,
  p_pockets jsonb,
  p_edge numeric,
  p_min_stake bigint,
  p_betting_s integer,
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
  v_distinct integer;
  v_in_range boolean;
  v_epoch numeric;
  v_current bigint;
  v_elapsed numeric;
  v_skipped jsonb;
  v_odds numeric;
  v_bet_id uuid;
  v_result jsonb;
BEGIN
  SELECT response INTO v_stored
    FROM public.idempotency_keys
   WHERE player_id = p_player_id AND key = p_idempotency_key;
  IF FOUND THEN RETURN v_stored; END IF;

  IF p_bet_type NOT IN ('straight','split','street','corner','six_line',
                        'dozen','column','red','black','odd','even','high','low') THEN
    RAISE EXCEPTION 'unknown bet type' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_coverage NOT IN (1, 2, 3, 4, 6, 12, 18) THEN
    RAISE EXCEPTION 'bad selection (coverage)' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- Shape: exactly p_coverage distinct integers in 0..36. Legality
  -- (which pairs are adjacent, which set is red) is the handler's
  -- derived registry; the audit re-derives it over stored rows.
  SELECT COUNT(DISTINCT v.n), bool_and(v.n BETWEEN 0 AND 36)
    INTO v_distinct, v_in_range
    FROM (SELECT (e.value)::text::integer AS n
            FROM jsonb_array_elements(p_selection) AS e) AS v;
  IF v_distinct IS NULL OR v_distinct <> p_coverage
     OR jsonb_array_length(p_selection) <> p_coverage OR NOT v_in_range THEN
    RAISE EXCEPTION 'bad selection' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_stake < p_min_stake THEN
    RAISE EXCEPTION 'stake below minimum of %', p_min_stake USING ERRCODE = 'invalid_parameter_value';
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

  -- Stragglers settle first, so their winnings can fund this stake.
  v_skipped := (public.roulette_settle_matured(
    p_player_id, p_pockets, p_edge, p_betting_s, p_period_s)) -> 'skipped';

  v_epoch := extract(epoch FROM now());
  v_current := floor(v_epoch / p_period_s)::bigint;
  v_elapsed := v_epoch - v_current * p_period_s;
  IF v_elapsed >= p_betting_s THEN
    RAISE EXCEPTION 'betting window closed' USING ERRCODE = 'check_violation';
  END IF;

  IF v_player.shells_balance < p_stake THEN
    RAISE EXCEPTION 'insufficient shells' USING ERRCODE = 'check_violation';
  END IF;

  -- The price is known at placement: 36 / coverage, exactly (dice
  -- semantics for decimal_odds; crash's at-settle reading also lives
  -- in 002's nullable column).
  v_odds := 36::numeric / p_coverage;

  INSERT INTO public.bets
    (player_id, game, stake, decimal_odds, state, payout, pearls_awarded,
     content_version)
  VALUES (p_player_id, 'roulette', p_stake, v_odds, 'open', 0, 0, p_content_version)
  RETURNING id INTO v_bet_id;

  INSERT INTO public.bet_roulette (bet_id, round_index, bet_type, selection)
  VALUES (v_bet_id, v_current, p_bet_type, p_selection);

  INSERT INTO public.ledger_entries (player_id, currency, amount, kind, ref_table, ref_id)
  VALUES (p_player_id, 'shells', -p_stake, 'bet_stake', 'bets', v_bet_id);

  UPDATE public.players
     SET shells_balance = shells_balance - p_stake
   WHERE id = p_player_id;

  PERFORM public.assert_balance_matches_ledger(p_player_id);

  SELECT jsonb_build_object(
    'betId', v_bet_id, 'roundIndex', v_current, 'betType', p_bet_type,
    'selection', p_selection, 'decimalOdds', v_odds, 'stake', p_stake,
    'skipped', v_skipped,
    'shells', shells_balance, 'pearls', pearls_balance
  ) INTO v_result FROM public.players WHERE id = p_player_id;

  INSERT INTO public.idempotency_keys (player_id, key, response)
  VALUES (p_player_id, p_idempotency_key, v_result);

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------ settle_roulette_bets
--
-- Keyless (natural idempotency: open->settled under the lock) with the
-- derived-state response — but the window is TIME-based (settled_at
-- within 5 minutes, newest first, LIMIT 200): with many bets per
-- round, a round-count window is unbounded per round AND misses a
-- straggler older than it, reopening the replay gap crash closed.
CREATE OR REPLACE FUNCTION settle_roulette_bets(
  p_player_id uuid,
  p_pockets jsonb,
  p_edge numeric,
  p_betting_s integer,
  p_period_s integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_skipped jsonb;
  v_recent jsonb;
  v_window_count integer;
  v_result jsonb;
BEGIN
  PERFORM 1 FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown player' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_skipped := (public.roulette_settle_matured(
    p_player_id, p_pockets, p_edge, p_betting_s, p_period_s)) -> 'skipped';

  PERFORM public.assert_balance_matches_ledger(p_player_id);

  SELECT COUNT(*) INTO v_window_count
    FROM public.bets b
    JOIN public.bet_roulette br ON br.bet_id = b.id
   WHERE b.player_id = p_player_id AND b.state = 'settled'
     AND b.settled_at > now() - interval '5 minutes';

  SELECT coalesce(jsonb_agg(row_j), '[]'::jsonb) INTO v_recent FROM (
    SELECT jsonb_build_object(
        'betId', b.id, 'roundIndex', br.round_index, 'betType', br.bet_type,
        'selection', br.selection, 'pocket', br.pocket,
        'won', b.payout > 0, 'stake', b.stake, 'payout', b.payout,
        'pearlsAwarded', b.pearls_awarded
      ) AS row_j
      FROM public.bets b
      JOIN public.bet_roulette br ON br.bet_id = b.id
     WHERE b.player_id = p_player_id AND b.state = 'settled'
       AND b.settled_at > now() - interval '5 minutes'
     ORDER BY b.settled_at DESC, b.id DESC
     LIMIT 200
  ) AS windowed;

  SELECT jsonb_build_object(
    'recent', v_recent, 'recentTruncated', v_window_count > 200,
    'skipped', v_skipped,
    'shells', shells_balance, 'pearls', pearls_balance,
    'pearlsPending', round(pearls_fraction, 3)
  ) INTO v_result FROM public.players WHERE id = p_player_id;

  RETURN v_result;
END;
$$;

-- --------------------------------- claim_one_time_task, + first_bet:roulette
--
-- Identical to 012 plus the new key and its condition. Expand-only.
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
                         'first_bet:crash', 'first_bet:roulette', 'first_equip') THEN
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
    WHEN 'first_bet:roulette' THEN
      EXISTS (SELECT 1 FROM public.bets WHERE player_id = p_player_id AND game = 'roulette')
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
-- settle_round_bet and roulette_settle_matured get NO grant: 007's
-- global default-privilege revoke makes an ungranted function
-- unreachable by the app role; only the SECURITY DEFINER verbs above
-- reach them.

GRANT EXECUTE ON FUNCTION place_roulette_bet(uuid, text, bigint, text, jsonb, integer, jsonb, numeric, bigint, integer, integer, text) TO oddssea_app;
GRANT EXECUTE ON FUNCTION settle_roulette_bets(uuid, jsonb, numeric, integer, integer) TO oddssea_app;
GRANT SELECT ON public.bet_roulette TO oddssea_app;
