-- 004 — grants, now that the objects exist.
--
-- These could not go in 001: you cannot GRANT on a table created in 002 or a
-- function created in 003. Ordering matters even in a migration that looks
-- like pure configuration.
--
-- The shape of the privilege model:
--
--   oddssea_app has EXECUTE on the write functions, SELECT on the three
--   non-credential tables, and NO write privilege on anything.
--
-- The functions are SECURITY DEFINER, so they carry the owner's privileges
-- when they run — which is exactly why the role needs none of its own. That
-- is the difference between a restriction and a decoration: `UPDATE
-- ledger_entries` as oddssea_app is not "discouraged by convention", it is
-- `permission denied`.

-- EXECUTE is granted to PUBLIC by default on every new function, so the
-- narrow grants below would mean nothing without this first.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

GRANT EXECUTE ON FUNCTION upsert_player(text, text, timestamptz) TO oddssea_app;
GRANT EXECUTE ON FUNCTION set_attestation(uuid, timestamptz) TO oddssea_app;
GRANT EXECUTE ON FUNCTION create_login_attempt(text, text, text, text, text) TO oddssea_app;
GRANT EXECUTE ON FUNCTION claim_login_attempt(text, text, integer) TO oddssea_app;
GRANT EXECUTE ON FUNCTION complete_login_attempt(text, uuid, text, timestamptz) TO oddssea_app;
GRANT EXECUTE ON FUNCTION read_session(uuid) TO oddssea_app;
GRANT EXECUTE ON FUNCTION delete_session(uuid) TO oddssea_app;
GRANT EXECUTE ON FUNCTION claim_login_task(uuid, text) TO oddssea_app;
GRANT EXECUTE ON FUNCTION place_dice_bet(uuid, text, bigint, text, integer, integer, integer, text) TO oddssea_app;

-- Reads the API genuinely needs: balances, history, bet display.
GRANT SELECT ON public.players TO oddssea_app;
GRANT SELECT ON public.ledger_entries TO oddssea_app;
GRANT SELECT ON public.bets TO oddssea_app;
GRANT SELECT ON public.bet_dice TO oddssea_app;

-- Deliberately absent: SELECT on `sessions` and `login_attempts`. Those hold
-- live refresh tokens and binding secrets, and are reachable only through
-- read_session / claim_login_attempt, which return exactly what the caller
-- needs and nothing else.
--
-- Also absent: bootstrap_app_password. Only the migration runner, connecting
-- as the admin role, may set a password.

-- Future tables and functions default to no access for oddssea_app rather
-- than inheriting anything, so a later migration has to grant deliberately.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
