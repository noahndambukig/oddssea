-- 001 — the application role, and the one credential that cannot be in SQL.
--
-- Creating a Secrets Manager secret does NOT create a Postgres login. The
-- role has to be created here, and its password has to match the generated
-- secret — but a bind parameter is not permitted in CREATE/ALTER ROLE
-- ... PASSWORD, because utility statements take string literals only.
--
-- So the password arrives through a function: the runner calls
-- bootstrap_app_password($1) with the value properly bound, and the function
-- builds the utility statement internally with format(%L), which quotes it
-- safely. String-interpolating a credential into SQL would be the obvious
-- alternative and is exactly what this avoids.

CREATE ROLE oddssea_app LOGIN;

CREATE OR REPLACE FUNCTION bootstrap_app_password(new_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  EXECUTE format('ALTER ROLE oddssea_app PASSWORD %L', new_password);
END;
$$;

REVOKE EXECUTE ON FUNCTION bootstrap_app_password(text) FROM PUBLIC;

-- Remove the default privileges every role inherits from PUBLIC.
--
-- TEMP matters more than it looks: a role that can create temporary tables
-- can shadow an unqualified table name inside a SECURITY DEFINER function,
-- because Postgres searches pg_temp implicitly. That is a privilege
-- escalation which looks like nothing in the code. The functions in 003 also
-- pin search_path with pg_temp LAST, so this is the second of two defences.
REVOKE TEMPORARY ON DATABASE oddssea FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE TEMPORARY ON DATABASE oddssea FROM oddssea_app;
REVOKE CREATE ON SCHEMA public FROM oddssea_app;

GRANT CONNECT ON DATABASE oddssea TO oddssea_app;
GRANT USAGE ON SCHEMA public TO oddssea_app;
