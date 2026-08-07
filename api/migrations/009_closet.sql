-- 009 — the closet: barebones equipping. The EXPAND half.
--
-- One table (loadouts — data-model.md's shape, preset-ready keys at a
-- constant 1), one column of durable evidence on players, one small
-- SECURITY DEFINER function, and an expand-only replacement of
-- claim_one_time_task.
--
-- Deliberately NOT here: the tour-chain contract. Rewiring
-- tour:first-bet to require the equip step ships as migration 010 in the
-- NEXT milestone's branch — the earliest point at which an app-stack
-- rollback lands on a handler that can still equip and claim the step.
-- Migrations land minutes before the handler and outlive a rollback, so
-- a migration that changes what a LIVE handler's calls mean must only
-- ADD until rolling back is safe (decisions/0025).
--
-- set_equipment carries NO idempotency key on purpose: overwriting a
-- loadout slot is naturally idempotent (same inputs, same state) and
-- moves no currency. The keyed machinery exists to make ECONOMIC retries
-- safe; the two task payouts ride the existing claim rails and keep
-- theirs.

-- ---------------------------------------------------------------- loadouts
--
-- Per slot: an equipped gear INSTANCE and skin INSTANCE (items.id, never
-- catalogue ids — two copies of a garment are different rows, and naming
-- which copy is what keeps provenance and salvage coherent later). Both
-- nullable: an empty slot and a bare garment are legal. preset is in the
-- key NOW at a constant 1, so the later presets feature adds rows rather
-- than rebuilding the primary key.
CREATE TABLE loadouts (
  player_id     uuid NOT NULL REFERENCES players(id),
  preset        smallint NOT NULL DEFAULT 1,
  slot          text NOT NULL CHECK (slot IN
                  ('headgear', 'shirt', 'pants', 'shoes', 'backpack', 'held')),
  gear_item_id  uuid REFERENCES items(id),
  skin_item_id  uuid REFERENCES items(id),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, preset, slot)
);

-- "First cosmetic equipped" is an EVENT, not current state: a player who
-- equips and then unequips before claiming must not lose the credit.
-- COALESCE'd on first equip, never unset; the task conditions read this,
-- never the live loadout.
ALTER TABLE players ADD COLUMN first_equipped_at timestamptz;

-- ------------------------------------------------------------ set_equipment
--
-- The single door to loadouts. SQL enforces the UNFORGEABLE: the item
-- exists, belongs to the caller, is 'owned', and its kind matches the
-- axis. Slot-fit (does this catalogue entry go in this slot, keystones
-- included) is catalogue knowledge and lives in the handler — a handler
-- bug there costs a cosmetically wrong slot, never money.
CREATE OR REPLACE FUNCTION set_equipment(
  p_player_id uuid,
  p_slot text,
  p_gear_item_id uuid,
  p_skin_item_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_player public.players%ROWTYPE;
  v_result jsonb;
BEGIN
  IF p_slot NOT IN ('headgear', 'shirt', 'pants', 'shoes', 'backpack', 'held') THEN
    RAISE EXCEPTION 'unknown slot' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_player FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown player' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_player.age_attested_at IS NULL THEN
    RAISE EXCEPTION 'player has not attested' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_gear_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.items
     WHERE id = p_gear_item_id AND player_id = p_player_id
       AND kind = 'gear' AND state = 'owned'
  ) THEN
    RAISE EXCEPTION 'item not owned or wrong item kind' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_skin_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.items
     WHERE id = p_skin_item_id AND player_id = p_player_id
       AND kind = 'skin' AND state = 'owned'
  ) THEN
    RAISE EXCEPTION 'item not owned or wrong item kind' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO public.loadouts (player_id, preset, slot, gear_item_id, skin_item_id)
  VALUES (p_player_id, 1, p_slot, p_gear_item_id, p_skin_item_id)
  ON CONFLICT (player_id, preset, slot) DO UPDATE
    SET gear_item_id = EXCLUDED.gear_item_id,
        skin_item_id = EXCLUDED.skin_item_id,
        updated_at = now();

  IF p_gear_item_id IS NOT NULL OR p_skin_item_id IS NOT NULL THEN
    UPDATE public.players
       SET first_equipped_at = COALESCE(first_equipped_at, now())
     WHERE id = p_player_id;
  END IF;

  SELECT jsonb_build_object(
    'slot', p_slot,
    'gearItemId', p_gear_item_id,
    'skinItemId', p_skin_item_id,
    'firstEquippedAt', (SELECT first_equipped_at FROM public.players WHERE id = p_player_id)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ------------------------------------------- claim_one_time_task, EXPAND only
--
-- Two new keys become claimable. tour:first-bet is deliberately NOT
-- rewired here — that is 010, next milestone, once the rollback target
-- can equip. Identical to 008 otherwise.
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
      EXISTS (SELECT 1 FROM public.one_time_claims
               WHERE player_id = p_player_id AND claim_key = 'tour:starter-crates')
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

-- ------------------------------------------------------------------- grants
--
-- Born without PUBLIC execute (007's global default) — the suite
-- verifies proacl rather than assuming. claim_one_time_task keeps its
-- grants across CREATE OR REPLACE (same signature, same object).

GRANT EXECUTE ON FUNCTION set_equipment(uuid, text, uuid, uuid) TO oddssea_app;
GRANT SELECT ON public.loadouts TO oddssea_app;
