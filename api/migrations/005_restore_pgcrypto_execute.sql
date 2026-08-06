-- 005 — give the definer role back its access to pgcrypto.
--
-- 004 ran `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC` to
-- make the EXECUTE grants that follow it meaningful. That was right for the
-- functions this project defines and WRONG for the ones it did not:
--
--   pgcrypto installs gen_random_bytes into `public`, owned by `rdsadmin`.
--   Every other role — including the master user that owns and runs our
--   SECURITY DEFINER functions — could execute it only THROUGH PUBLIC.
--
-- So the revoke stripped the definer role's own access, and uuidv7() (called
-- as the id DEFAULT on every insert) started failing with "permission denied
-- for function gen_random_bytes". Nothing about the message points at the
-- revoke three migrations earlier.
--
-- The grant is to the CURRENT USER rather than a hardcoded 'postgres',
-- because the master username is configuration, not a constant. Note that
-- oddssea_app is deliberately NOT granted this: it never calls uuidv7()
-- directly — every insert reaches it through a SECURITY DEFINER function,
-- which runs as the owner.
--
-- The general lesson, worth more than the fix: a blanket REVOKE over a
-- SCHEMA hits everything in it, including objects an extension put there and
-- which you do not own. Prefer revoking the functions you created.

DO $$
BEGIN
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION public.gen_random_bytes(integer) TO %I',
    current_user
  );
END;
$$;
