-- 162_user_account_security_and_sessions.sql
-- Owner: Dev2 | Issue: CATMS-045, CATMS-046
-- Adds atomic failed login attempts, lock state, active state, and token version tracking to catms.user_account

BEGIN;

ALTER TABLE catms.user_account
    ADD COLUMN IF NOT EXISTS failed_attempts SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 1;

-- Synchronize existing values from legacy columns
UPDATE catms.user_account
SET failed_attempts = COALESCE(failed_login_count, 0),
    is_locked = (UPPER(account_status) = 'LOCKED'),
    is_active = (UPPER(account_status) = 'ACTIVE');

-- Record migration
INSERT INTO catms.schema_migrations (version, description, applied_by)
VALUES (162, 'atomic failed login counter, lock state, and token version tracking', current_user)
ON CONFLICT (version) DO NOTHING;

COMMIT;
