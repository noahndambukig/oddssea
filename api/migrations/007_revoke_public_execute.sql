-- 007 — close the PUBLIC-execute hole 006 opened, and retire the
-- assumption that opened it.
--
-- The crates adversarial suite expected `permission denied` from
-- crate_open_locked() as oddssea_app and instead reached the function
-- body: the internal function — the one that skips the idempotency,
-- attestation, starter-gate and balance checks its callers perform — was
-- executable by the app role.
--
-- Why: 006 relied on 004's
--
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
--
-- to strip the built-in PUBLIC execute from newly created functions.
-- That statement does nothing of the sort. Per-schema default privileges
-- are ADDED to the global defaults; a per-schema REVOKE can only remove
-- privileges a per-schema GRANT default added — it cannot remove
-- PostgreSQL's built-in PUBLIC-execute-on-functions default. The ACLs
-- prove it: crate_open_locked's proacl was NULL (the built-in default),
-- and the explicit grants in 006 materialised `=X` — a PUBLIC entry —
-- onto open_crate and claim_starter_crates.
--
-- 004's OTHER line (`REVOKE EXECUTE ON ALL FUNCTIONS ... FROM PUBLIC`)
-- was real, which is why every 003 function is clean — they existed when
-- it ran — and CREATE OR REPLACE preserves an existing function's ACL,
-- which is why 006's retrofit of claim_login_task/place_dice_bet stayed
-- clean. Only the three functions CREATED in 006 carried PUBLIC execute.
--
-- 006's grants comment claims otherwise; applied migrations are history,
-- so the correction lives here rather than in an edit.

REVOKE EXECUTE ON FUNCTION crate_open_locked(uuid, text, text, integer, integer, jsonb, jsonb, bigint, text, integer, integer, text, text, text, bigint, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION open_crate(uuid, text, text, text, integer, integer, jsonb, jsonb, bigint, integer, integer, text, text, bigint, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_starter_crates(uuid, text, jsonb, text, text, bigint, bigint) FROM PUBLIC;

-- The GLOBAL form — no IN SCHEMA — is the one that genuinely removes the
-- built-in default for functions this role creates from now on. Future
-- migrations start from zero grants, as 004 intended.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
