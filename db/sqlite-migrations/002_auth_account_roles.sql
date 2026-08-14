-- Idempotent upgrade for DBs created before account_role existed.
-- 001 already includes account_role for new databases; SqliteAuthStore also backfills at open.

UPDATE auth_users
SET account_role = CASE
  WHEN lower(email) = 'meckert@vpc.com' THEN 'admin'
  ELSE COALESCE(account_role, 'regular')
END;
