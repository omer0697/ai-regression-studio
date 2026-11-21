-- Phase 6: standalone PDF evidence artifacts.

ALTER TABLE artifact ALTER COLUMN execution_id DROP NOT NULL;

ALTER TABLE artifact DROP CONSTRAINT ck_artifact_type;
ALTER TABLE artifact ADD CONSTRAINT ck_artifact_type CHECK (
    artifact_type IN ('SCREENSHOT', 'TRACE', 'CONSOLE_LOG', 'NETWORK_LOG', 'PDF'));
