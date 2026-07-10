ALTER TABLE auth_users ADD COLUMN account_role TEXT NOT NULL DEFAULT 'regular';

UPDATE auth_users
SET account_role = CASE
  WHEN lower(email) = 'meckert@vpc.com' THEN 'admin'
  ELSE 'regular'
END;
