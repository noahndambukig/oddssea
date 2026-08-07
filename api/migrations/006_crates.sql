-- 006 — crates: the first Pearl sink, and the audit trail for it.
--
-- Four new tables (plus the two the data model always had coming), two new
-- SECURITY DEFINER functions, and a retrofit of the two shipped economic
-- functions.
--
-- The design constraint that shaped everything here: pity counters and the
-- first-four-distinct rule are STATE, and must be read under the player row
-- lock — but the ledger rule is one Data API call per economic event, so no
-- lock may span calls. The handler therefore pre-rolls ALL randomness (tier
-- roll, per-tier candidates, the set permutation) and passes it in; these
-- functions apply the rules to it under the lock, in one transaction. The
-- whole pre-rolled payload is stored on crate_opens, so the audit trail
-- carries every draw — including the ones a pity override left unused,
-- which is precisely what lets an auditor distinguish luck from mercy.
--
-- No drop rate, price, pity threshold or bonus amount appears in this file.
-- They arrive as parameters, read by the handler from the shipping copy
-- (docs/03-cosmetics/content/data/drop-tables.json) — numbers keep exactly
-- one home.

-- ------------------------------------------------------------------- items
--
-- One row per owned instance. 002 scoped its tables to what that slice
-- used, so the inventory tables land here, with the crates that fill them.
CREATE TABLE items (
  id                uuid PRIMARY KEY DEFAULT uuidv7(),
  player_id         uuid NOT NULL REFERENCES players(id),
  catalogue_id      text NOT NULL,
  content_version   text NOT NULL,
  kind              text NOT NULL CHECK (kind IN ('gear', 'skin')),
  source            text NOT NULL,
  state             text NOT NULL DEFAULT 'owned'
                      CHECK (state IN ('owned', 'escrowed', 'consumed')),
  acquired_at       timestamptz NOT NULL DEFAULT now()
);

-- Postgres indexes primary keys and UNIQUE constraints automatically —
-- never foreign-key columns. 002 set the precedent of indexing per-player
-- access paths at creation (ledger_entries, sessions, bets); these are the
-- two hot paths here: collection reads and set-completion checks…
CREATE INDEX items_player_catalogue ON items (player_id, catalogue_id);

-- ------------------------------------------------------------- dex_entries
--
-- One row per player per catalogue entry ever held. first_owned_at is
-- nullable for a future discover-without-owning mechanic; today crates are
-- the only writer and always set it.
CREATE TABLE dex_entries (
  player_id         uuid NOT NULL REFERENCES players(id),
  catalogue_id      text NOT NULL,
  discovered_at     timestamptz NOT NULL DEFAULT now(),
  first_owned_at    timestamptz,
  PRIMARY KEY (player_id, catalogue_id)
);

-- ------------------------------------------------------------- crate_opens
--
-- The odds-disclosure audit trail compliance.md promises: every open, its
-- price, every random draw that could have influenced it (tier_roll AND the
-- full candidates payload), what the roll said, what the rules made of it,
-- and the item that resulted. rolled_tier differs from effective_tier only
-- when pity_fired says why.
CREATE TABLE crate_opens (
  id                  uuid PRIMARY KEY DEFAULT uuidv7(),
  player_id           uuid NOT NULL REFERENCES players(id),
  kind                text NOT NULL CHECK (kind IN
                        ('basic_gear', 'basic_skin', 'premium_gear', 'premium_skin', 'set')),
  target_set          text,
  price_pearls        bigint NOT NULL CHECK (price_pearls >= 0),
  tier_roll           integer NOT NULL,
  roll_max            integer NOT NULL,
  rolled_tier         text NOT NULL CHECK (rolled_tier IN ('common', 'rare', 'epic', 'legendary')),
  effective_tier      text NOT NULL CHECK (effective_tier IN ('common', 'rare', 'epic', 'legendary')),
  pity_fired          boolean NOT NULL,
  candidates          jsonb NOT NULL,
  drop_table_version  text NOT NULL,
  content_version     text NOT NULL,
  catalogue_id        text NOT NULL,
  item_id             uuid NOT NULL REFERENCES items(id),
  idempotency_key     text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  -- A roll is only meaningful against the space it was drawn from
  -- (data-model.md rule 5), and a set open must name its set.
  CHECK (tier_roll >= 1 AND tier_roll <= roll_max),
  CHECK ((kind = 'set') = (target_set IS NOT NULL))
);

-- …and the first-four-distinct rule, which reads a player's prior pulls
-- against a set on every set open.
CREATE INDEX crate_opens_player_kind_target ON crate_opens (player_id, kind, target_set);

-- ----------------------------------------------------------- pity_counters
--
-- One row per player per pity scope. A PRIMARY KEY column is implicitly
-- NOT NULL, so the account-wide scopes use '' as the target sentinel rather
-- than NULL — (player, 'basic', '') is the account-wide basic row, and
-- (player, 'set_chase', 'set.tidepool') is one chase.
--
-- legendary_counter counts opens since the last Legendary (it INCLUDES the
-- current open — increment-then-check, so pity fires ON the Nth open, as
-- the simulation of record does). For set_chase it is total opens against
-- the set and never resets; the keystone-owned condition retires it.
-- epic_drought counts consecutive PRIOR basic opens below Epic — checked
-- before increment, so it forces the open AFTER its threshold of misses.
CREATE TABLE pity_counters (
  player_id           uuid NOT NULL REFERENCES players(id),
  scope               text NOT NULL CHECK (scope IN ('basic', 'premium', 'set_chase')),
  target              text NOT NULL DEFAULT '',
  legendary_counter   integer NOT NULL DEFAULT 0,
  epic_drought        integer NOT NULL DEFAULT 0,
  total_opens         integer NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, scope, target)
);

-- --------------------------------------------------------- one_time_claims
--
-- Everything that pays exactly once: the starter grant, each dex page's
-- completion bonus, each set's completion bonus. The UNIQUE constraint is
-- the once-ness; the ledger row references this row as its provenance.
CREATE TABLE one_time_claims (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  player_id     uuid NOT NULL REFERENCES players(id),
  claim_key     text NOT NULL,
  amount        bigint NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, claim_key)
);

-- ---------------------------------------------------- crate_open_locked
--
-- The core of one open. INTERNAL: it assumes the caller already holds the
-- player row lock and has checked idempotency, attestation, the starter
-- gate and the balance. It is deliberately NOT granted to oddssea_app —
-- 004's default-privileges revoke means no grant, no access.
--
-- Steps: map the tier roll → apply pity (increment-then-check) → choose
-- the item from the pre-rolled candidates → insert items THEN crate_opens
-- (the FK is immediate; the referenced row must exist first) → dex upsert
-- → debit → completion bonuses. One transaction, the caller's.
CREATE OR REPLACE FUNCTION crate_open_locked(
  p_player_id uuid,
  p_kind text,
  p_target_set text,
  p_tier_roll integer,
  p_roll_max integer,
  p_rates jsonb,
  p_candidates jsonb,
  p_price bigint,
  p_source text,
  p_pity_threshold integer,
  p_drought_threshold integer,
  p_drop_table_version text,
  p_content_version text,
  p_idempotency_key text,
  p_dex_page_bonus bigint,
  p_set_bonus bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_cum_common numeric;
  v_cum_rare numeric;
  v_cum_epic numeric;
  v_cum_legendary numeric;
  v_rolled text;
  v_effective text;
  v_pity_fired boolean := false;
  v_scope text;
  v_target text;
  v_counter integer;
  v_prior_drought integer;
  v_new_counter integer;
  v_new_drought integer;
  v_keystone_owned boolean := false;
  v_prior_pulls integer;
  v_pulled text[];
  v_catalogue_id text;
  v_item_id uuid;
  v_open_id uuid;
  v_meta jsonb;
  v_claim_key text;
  v_claim_id uuid;
  v_have integer;
  v_completions jsonb := '[]'::jsonb;
BEGIN
  IF p_tier_roll < 1 OR p_tier_roll > p_roll_max THEN
    RAISE EXCEPTION 'tier roll outside its space' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Rates arrive as exact decimals in jsonb; ::numeric keeps them exact, so
  -- the thresholds are integers and the mapping is integer comparison — no
  -- floating point at the decision site.
  v_cum_common := round((p_rates->>'common')::numeric * p_roll_max);
  v_cum_rare := v_cum_common + round((p_rates->>'rare')::numeric * p_roll_max);
  v_cum_epic := v_cum_rare + round((p_rates->>'epic')::numeric * p_roll_max);
  v_cum_legendary := v_cum_epic + round((p_rates->>'legendary')::numeric * p_roll_max);
  IF v_cum_legendary <> p_roll_max THEN
    RAISE EXCEPTION 'rates do not cover the roll space' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_rolled := CASE
    WHEN p_tier_roll <= v_cum_common THEN 'common'
    WHEN p_tier_roll <= v_cum_rare THEN 'rare'
    WHEN p_tier_roll <= v_cum_epic THEN 'epic'
    ELSE 'legendary'
  END;

  v_scope := CASE
    WHEN p_kind IN ('basic_gear', 'basic_skin') THEN 'basic'
    WHEN p_kind IN ('premium_gear', 'premium_skin') THEN 'premium'
    ELSE 'set_chase'
  END;
  v_target := CASE WHEN v_scope = 'set_chase' THEN p_target_set ELSE '' END;

  -- Increment THEN check: the counter includes the current open, so pity
  -- fires ON the Nth open, exactly as crate-game.py's `since += 1; if
  -- since >= PITY`. epic_drought is returned at its PRIOR value — the
  -- drought rule is the deliberate exception and fires the open AFTER its
  -- misses.
  INSERT INTO public.pity_counters AS pc
    (player_id, scope, target, legendary_counter, epic_drought, total_opens)
  VALUES (p_player_id, v_scope, v_target, 1, 0, 1)
  ON CONFLICT (player_id, scope, target) DO UPDATE
    SET legendary_counter = pc.legendary_counter + 1,
        total_opens = pc.total_opens + 1
  RETURNING pc.legendary_counter, pc.epic_drought INTO v_counter, v_prior_drought;

  IF v_scope = 'set_chase' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.items
       WHERE player_id = p_player_id AND catalogue_id = p_candidates->>'keystone'
    ) INTO v_keystone_owned;
  END IF;

  v_effective := v_rolled;
  IF v_rolled <> 'legendary' AND v_counter >= p_pity_threshold THEN
    -- Set-chase pity retires once the keystone is owned; the account-wide
    -- pities always fire.
    IF v_scope <> 'set_chase' OR NOT v_keystone_owned THEN
      v_effective := 'legendary';
      v_pity_fired := true;
    END IF;
  END IF;
  IF v_scope = 'basic' AND p_drought_threshold IS NOT NULL
     AND v_effective IN ('common', 'rare') AND v_prior_drought >= p_drought_threshold THEN
    v_effective := 'epic';
    v_pity_fired := true;
  END IF;

  -- Resets: a Legendary — luck or pity — clears the account-wide counters;
  -- Epic-or-better clears the drought. set_chase never resets (the
  -- keystone-owned condition is what retires it).
  v_new_counter := CASE
    WHEN v_effective = 'legendary' AND v_scope IN ('basic', 'premium') THEN 0
    ELSE v_counter
  END;
  v_new_drought := CASE
    WHEN v_scope <> 'basic' THEN v_prior_drought
    WHEN v_effective IN ('epic', 'legendary') THEN 0
    ELSE v_prior_drought + 1
  END;
  UPDATE public.pity_counters
     SET legendary_counter = v_new_counter, epic_drought = v_new_drought
   WHERE player_id = p_player_id AND scope = v_scope AND target = v_target;

  -- Item selection, from the pre-rolled candidates only.
  IF p_kind = 'set' THEN
    IF v_effective = 'legendary' THEN
      -- Unconditionally — even a duplicate. The keystone is EXEMPT from
      -- first-four distinctness (crate-game.py redirects only non-keystone
      -- pieces); redirecting the second jackpot would make the chase
      -- cheaper than the simulated economy.
      v_catalogue_id := p_candidates->>'keystone';
    ELSE
      SELECT COUNT(*), COALESCE(array_agg(catalogue_id), ARRAY[]::text[])
        INTO v_prior_pulls, v_pulled
        FROM public.crate_opens
       WHERE player_id = p_player_id AND kind = 'set' AND target_set = p_target_set;

      -- Within the first four PULLS against this set (pulls, not ownership
      -- — pieces can arrive via skin crates), take the first permutation
      -- entry not already pulled. Afterwards, the head: the permutation is
      -- uniform, so the head is a uniform pick.
      IF v_prior_pulls < 4 THEN
        SELECT t.id INTO v_catalogue_id
          FROM jsonb_array_elements_text(p_candidates->'permutation')
               WITH ORDINALITY AS t(id, ord)
         WHERE NOT (t.id = ANY(v_pulled))
         ORDER BY t.ord
         LIMIT 1;
      END IF;
      IF v_catalogue_id IS NULL THEN
        v_catalogue_id := p_candidates->'permutation'->>0;
      END IF;
    END IF;
  ELSE
    v_catalogue_id := p_candidates->'picks'->>v_effective;
  END IF;

  IF v_catalogue_id IS NULL THEN
    RAISE EXCEPTION 'candidates missing tier %', v_effective USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- The items row FIRST: crate_opens.item_id is an immediate foreign key,
  -- so the referenced row must exist before the referencing one.
  INSERT INTO public.items (player_id, catalogue_id, content_version, kind, source, state)
  VALUES (p_player_id, v_catalogue_id, p_content_version,
          CASE WHEN p_kind IN ('basic_gear', 'premium_gear') THEN 'gear' ELSE 'skin' END,
          p_source, 'owned')
  RETURNING id INTO v_item_id;

  INSERT INTO public.crate_opens
    (player_id, kind, target_set, price_pearls, tier_roll, roll_max, rolled_tier,
     effective_tier, pity_fired, candidates, drop_table_version, content_version,
     catalogue_id, item_id, idempotency_key)
  VALUES
    (p_player_id, p_kind, p_target_set, p_price, p_tier_roll, p_roll_max, v_rolled,
     v_effective, v_pity_fired, p_candidates, p_drop_table_version, p_content_version,
     v_catalogue_id, v_item_id, p_idempotency_key)
  RETURNING id INTO v_open_id;

  INSERT INTO public.dex_entries (player_id, catalogue_id, discovered_at, first_owned_at)
  VALUES (p_player_id, v_catalogue_id, now(), now())
  ON CONFLICT (player_id, catalogue_id) DO UPDATE
    SET first_owned_at = COALESCE(public.dex_entries.first_owned_at, EXCLUDED.first_owned_at);

  IF p_price > 0 THEN
    INSERT INTO public.ledger_entries (player_id, currency, amount, kind, ref_table, ref_id)
    VALUES (p_player_id, 'pearls', -p_price, 'crate_purchase', 'crate_opens', v_open_id);

    UPDATE public.players
       SET pearls_balance = pearls_balance - p_price
     WHERE id = p_player_id;
  END IF;

  -- Completion bonuses, paid INSIDE the transaction that completed them.
  -- The candidates payload carries each possible item's dex page and set,
  -- so the check needs no catalogue knowledge here. one_time_claims is the
  -- once-ness; its row is the ledger entry's provenance.
  v_meta := p_candidates->'meta'->v_catalogue_id;

  IF v_meta ? 'page' THEN
    v_claim_key := 'dex_page:' || (v_meta->>'page');
    IF NOT EXISTS (SELECT 1 FROM public.one_time_claims
                    WHERE player_id = p_player_id AND claim_key = v_claim_key) THEN
      SELECT COUNT(*) INTO v_have
        FROM public.dex_entries
       WHERE player_id = p_player_id
         AND first_owned_at IS NOT NULL
         AND catalogue_id IN (SELECT jsonb_array_elements_text(v_meta->'pageMembers'));
      IF v_have = jsonb_array_length(v_meta->'pageMembers') THEN
        INSERT INTO public.one_time_claims (player_id, claim_key, amount)
        VALUES (p_player_id, v_claim_key, p_dex_page_bonus)
        RETURNING id INTO v_claim_id;

        INSERT INTO public.ledger_entries (player_id, currency, amount, kind, ref_table, ref_id)
        VALUES (p_player_id, 'shells', p_dex_page_bonus, 'completion_bonus', 'one_time_claims', v_claim_id);

        UPDATE public.players
           SET shells_balance = shells_balance + p_dex_page_bonus
         WHERE id = p_player_id;

        v_completions := v_completions || jsonb_build_array(jsonb_build_object(
          'type', 'dex_page', 'key', v_meta->>'page', 'shells', p_dex_page_bonus));
      END IF;
    END IF;
  END IF;

  IF v_meta ? 'set' THEN
    v_claim_key := 'set:' || (v_meta->>'set');
    IF NOT EXISTS (SELECT 1 FROM public.one_time_claims
                    WHERE player_id = p_player_id AND claim_key = v_claim_key) THEN
      SELECT COUNT(*) INTO v_have
        FROM public.dex_entries
       WHERE player_id = p_player_id
         AND first_owned_at IS NOT NULL
         AND catalogue_id IN (SELECT jsonb_array_elements_text(v_meta->'setMembers'));
      IF v_have = jsonb_array_length(v_meta->'setMembers') THEN
        INSERT INTO public.one_time_claims (player_id, claim_key, amount)
        VALUES (p_player_id, v_claim_key, p_set_bonus)
        RETURNING id INTO v_claim_id;

        INSERT INTO public.ledger_entries (player_id, currency, amount, kind, ref_table, ref_id)
        VALUES (p_player_id, 'shells', p_set_bonus, 'completion_bonus', 'one_time_claims', v_claim_id);

        UPDATE public.players
           SET shells_balance = shells_balance + p_set_bonus
         WHERE id = p_player_id;

        v_completions := v_completions || jsonb_build_array(jsonb_build_object(
          'type', 'set', 'key', v_meta->>'set', 'shells', p_set_bonus));
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'openId', v_open_id,
    'kind', p_kind,
    'targetSet', p_target_set,
    'rolledTier', v_rolled,
    'effectiveTier', v_effective,
    'pityFired', v_pity_fired,
    'catalogueId', v_catalogue_id,
    'itemId', v_item_id,
    'completions', v_completions,
    'pity', jsonb_build_object(
      'scope', v_scope,
      'target', v_target,
      'legendaryCounter', v_new_counter,
      'legendaryThreshold', p_pity_threshold,
      'epicDrought', v_new_drought,
      'droughtThreshold', p_drought_threshold,
      'totalOpens', (SELECT total_opens FROM public.pity_counters
                      WHERE player_id = p_player_id AND scope = v_scope AND target = v_target)
    )
  );
END;
$$;

-- ---------------------------------------------------------------- open_crate
--
-- One paid open: the fifth economic event, and the first that spends
-- Pearls. Same skeleton as claim_login_task/place_dice_bet, plus the
-- starter gate and the idempotency RE-CHECK under the lock.
CREATE OR REPLACE FUNCTION open_crate(
  p_player_id uuid,
  p_idempotency_key text,
  p_kind text,
  p_target_set text,
  p_tier_roll integer,
  p_roll_max integer,
  p_rates jsonb,
  p_candidates jsonb,
  p_price bigint,
  p_pity_threshold integer,
  p_drought_threshold integer,
  p_drop_table_version text,
  p_content_version text,
  p_dex_page_bonus bigint,
  p_set_bonus bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_stored jsonb;
  v_player public.players%ROWTYPE;
  v_open jsonb;
  v_result jsonb;
BEGIN
  IF p_kind NOT IN ('basic_gear', 'basic_skin', 'premium_gear', 'premium_skin', 'set') THEN
    RAISE EXCEPTION 'unknown crate kind' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF (p_kind = 'set') <> (p_target_set IS NOT NULL) THEN
    RAISE EXCEPTION 'set crates need a target set; others must not have one'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT response INTO v_stored
    FROM public.idempotency_keys
   WHERE player_id = p_player_id AND key = p_idempotency_key;
  IF FOUND THEN RETURN v_stored; END IF;

  SELECT * INTO v_player FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown player' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Re-check under the lock: two concurrent calls with the same key can
  -- both miss the pre-check above; the loser serialises here and must
  -- return the stored response, not die on the key insert.
  SELECT response INTO v_stored
    FROM public.idempotency_keys
   WHERE player_id = p_player_id AND key = p_idempotency_key;
  IF FOUND THEN RETURN v_stored; END IF;

  IF v_player.age_attested_at IS NULL THEN
    RAISE EXCEPTION 'player has not attested' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The first-session guarantee (crates.md: a "must") enforced
  -- structurally: no paid open until the starter grant's 2 gear + 1 skin
  -- are the player's first three opens. The UI hides the buttons; THIS is
  -- the control.
  IF NOT EXISTS (SELECT 1 FROM public.one_time_claims
                  WHERE player_id = p_player_id AND claim_key = 'starter_crates') THEN
    RAISE EXCEPTION 'starter crates must be claimed first' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_player.pearls_balance < p_price THEN
    RAISE EXCEPTION 'insufficient pearls' USING ERRCODE = 'check_violation';
  END IF;

  v_open := public.crate_open_locked(
    p_player_id, p_kind, p_target_set, p_tier_roll, p_roll_max, p_rates,
    p_candidates, p_price, 'crate', p_pity_threshold, p_drought_threshold,
    p_drop_table_version, p_content_version, p_idempotency_key,
    p_dex_page_bonus, p_set_bonus);

  PERFORM public.assert_balance_matches_ledger(p_player_id);

  SELECT jsonb_build_object(
    'open', v_open, 'shells', shells_balance, 'pearls', pearls_balance
  ) INTO v_result FROM public.players WHERE id = p_player_id;

  INSERT INTO public.idempotency_keys (player_id, key, response)
  VALUES (p_player_id, p_idempotency_key, v_result);

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------ claim_starter_crates
--
-- The onboarding grant (currency-model.md): three Basic opens at price 0,
-- source 'starter_grant'. NO ledger rows — the ledger records currency
-- movements and none occurs; crate_opens + items carry the audit trail.
-- The composition is re-verified here, so a modified client cannot claim
-- three of anything else — 2 Basic Gear + 1 Basic Skin is what makes the
-- first-session guarantee structural.
CREATE OR REPLACE FUNCTION claim_starter_crates(
  p_player_id uuid,
  p_idempotency_key text,
  p_opens jsonb,
  p_drop_table_version text,
  p_content_version text,
  p_dex_page_bonus bigint,
  p_set_bonus bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_stored jsonb;
  v_player public.players%ROWTYPE;
  v_gear integer;
  v_skin integer;
  v_total integer;
  v_spec jsonb;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
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
              WHERE player_id = p_player_id AND claim_key = 'starter_crates') THEN
    RAISE EXCEPTION 'starter crates already claimed' USING ERRCODE = 'unique_violation';
  END IF;

  SELECT COUNT(*) FILTER (WHERE value->>'kind' = 'basic_gear'),
         COUNT(*) FILTER (WHERE value->>'kind' = 'basic_skin'),
         COUNT(*)
    INTO v_gear, v_skin, v_total
    FROM jsonb_array_elements(p_opens);
  IF v_total <> 3 OR v_gear <> 2 OR v_skin <> 1 THEN
    RAISE EXCEPTION 'starter grant must be two basic gear and one basic skin'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO public.one_time_claims (player_id, claim_key, amount)
  VALUES (p_player_id, 'starter_crates', 0);

  FOR v_spec IN SELECT value FROM jsonb_array_elements(p_opens) LOOP
    v_results := v_results || jsonb_build_array(public.crate_open_locked(
      p_player_id,
      v_spec->>'kind',
      NULL,
      (v_spec->>'tierRoll')::integer,
      (v_spec->>'rollMax')::integer,
      v_spec->'rates',
      v_spec->'candidates',
      0,
      'starter_grant',
      (v_spec->>'pityThreshold')::integer,
      (v_spec->>'droughtThreshold')::integer,
      p_drop_table_version,
      p_content_version,
      p_idempotency_key,
      p_dex_page_bonus,
      p_set_bonus));
  END LOOP;

  PERFORM public.assert_balance_matches_ledger(p_player_id);

  SELECT jsonb_build_object(
    'opens', v_results, 'shells', shells_balance, 'pearls', pearls_balance
  ) INTO v_result FROM public.players WHERE id = p_player_id;

  INSERT INTO public.idempotency_keys (player_id, key, response)
  VALUES (p_player_id, p_idempotency_key, v_result);

  RETURN v_result;
END;
$$;

-- -------------------------------------------- retrofit: the shipped functions
--
-- Reviewing the crates plan surfaced a race that exists in 003 AS SHIPPED:
-- the idempotency check runs before the player row lock and is never
-- repeated after it. Two concurrent calls with the same key can both miss
-- the pre-check; the loser then waits on the lock, redoes the work, and
-- dies on the idempotency-key insert instead of returning the stored
-- response. The fix is the same re-check-under-the-lock the new functions
-- use. Replacing a function in a NEW migration is additive history —
-- editing 003 would be rewriting it. Identical to 003 except the re-check.

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

  -- Re-check under the lock (006): concurrent same-key calls can both miss
  -- the pre-check; the loser must return the stored response.
  SELECT response INTO v_stored
    FROM public.idempotency_keys
   WHERE player_id = p_player_id AND key = p_idempotency_key;
  IF FOUND THEN RETURN v_stored; END IF;

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
  -- Figures are the ones in docs/02-economy/currency-model.md (as in 003).
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

  v_wins := CASE WHEN p_direction = 'under' THEN p_threshold - 1
                 ELSE p_roll_max - p_threshold END;
  IF v_wins < 1 OR v_wins >= p_roll_max THEN
    RAISE EXCEPTION 'threshold leaves no contest' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_probability := v_wins::numeric / p_roll_max::numeric;

  v_odds := (1 - v_edge) / v_probability;

  v_won := CASE WHEN p_direction = 'under' THEN p_roll < p_threshold
                ELSE p_roll > p_threshold END;
  IF v_won THEN v_payout := floor(p_stake * v_odds)::bigint; END IF;

  v_pearls_exact :=
    (0.75 * p_stake * v_edge)
    + CASE WHEN v_won THEN 0.30 * p_stake * v_edge * v_odds ELSE 0 END;

  SELECT * INTO v_player FROM public.players WHERE id = p_player_id FOR UPDATE;

  -- Re-check under the lock (006): concurrent same-key calls can both miss
  -- the pre-check; the loser must return the stored response.
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
  VALUES (p_player_id, 'dice', p_stake, v_odds, 'settled', v_payout, v_pearls,
          p_content_version, now())
  RETURNING id INTO v_bet_id;

  INSERT INTO public.bet_dice (bet_id, direction, threshold, roll, roll_max, won)
  VALUES (v_bet_id, p_direction, p_threshold, p_roll, p_roll_max, v_won);

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

-- ------------------------------------------------------------------- grants
--
-- 004's ALTER DEFAULT PRIVILEGES already stripped PUBLIC execute from new
-- functions, so everything here is explicit and minimal. crate_open_locked
-- gets NO grant on purpose: it skips the idempotency/attestation/gate
-- checks its callers perform, so only the definer may reach it.
-- claim_login_task and place_dice_bet keep their 004 grants across
-- CREATE OR REPLACE (same signature = same object).

GRANT EXECUTE ON FUNCTION open_crate(uuid, text, text, text, integer, integer, jsonb, jsonb, bigint, integer, integer, text, text, bigint, bigint) TO oddssea_app;
GRANT EXECUTE ON FUNCTION claim_starter_crates(uuid, text, jsonb, text, text, bigint, bigint) TO oddssea_app;

-- Reads the API genuinely needs: the collection screen, the dex, pity
-- disclosure, starter/bonus status, open history. All append-only from the
-- app role's point of view — SELECT is the only privilege granted.
GRANT SELECT ON public.items TO oddssea_app;
GRANT SELECT ON public.dex_entries TO oddssea_app;
GRANT SELECT ON public.crate_opens TO oddssea_app;
GRANT SELECT ON public.pity_counters TO oddssea_app;
GRANT SELECT ON public.one_time_claims TO oddssea_app;
