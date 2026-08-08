-- 010 — the tour-chain CONTRACT, owed since 009 (decisions/0025).
--
-- 009 expanded (the equip step became claimable) but deliberately left
-- tour:first-bet's condition alone, because contracting it while the
-- pre-closet handler was still a rollback target would have stranded new
-- players on a chain requiring a step that handler could not perform.
-- This migration ships on the NEXT milestone's branch — the earliest
-- point where every rollback target can equip — and makes the single
-- change: tour:first-bet now requires tour:equip (was
-- tour:starter-crates). The spec's teaching order (intro → crate →
-- equip → bet) becomes SQL-enforced. Identical to 009 otherwise.
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
                         'tour:first-bet', 'first_bet:dice', 'first_equip') THEN
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
      -- THE contract: the spec's order, now enforced.
      EXISTS (SELECT 1 FROM public.one_time_claims
               WHERE player_id = p_player_id AND claim_key = 'tour:equip')
      AND EXISTS (SELECT 1 FROM public.bets WHERE player_id = p_player_id)
    WHEN 'first_bet:dice' THEN
      EXISTS (SELECT 1 FROM public.bets WHERE player_id = p_player_id AND game = 'dice')
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
