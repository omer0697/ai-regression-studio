-- Phase 5: element mappings (GWT <-> React) and evidence-backed bug findings.

CREATE TABLE element_mapping (
    id          BIGSERIAL PRIMARY KEY,
    project_id  BIGINT       NOT NULL,
    screen_code VARCHAR(32)  NOT NULL,
    execution_id BIGINT      NOT NULL REFERENCES test_execution (id) ON DELETE CASCADE,
    legacy_ref  VARCHAR(64)  NOT NULL,
    legacy_label VARCHAR(300),
    react_ref   VARCHAR(64),
    react_label VARCHAR(300),
    confidence  NUMERIC(3, 2) NOT NULL,
    method      VARCHAR(20)  NOT NULL,
    needs_review BOOLEAN    NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_mapping_method CHECK (method IN ('LABEL', 'AI', 'NONE'))
);

CREATE INDEX idx_mapping_screen ON element_mapping (project_id, screen_code);
CREATE INDEX idx_mapping_exec ON element_mapping (execution_id);

CREATE TABLE bug_finding (
    id             BIGSERIAL PRIMARY KEY,
    bug_code       VARCHAR(40)  NOT NULL,
    project_id     BIGINT       NOT NULL,
    execution_id   BIGINT       NOT NULL REFERENCES test_execution (id) ON DELETE CASCADE,
    screen_code    VARCHAR(32)  NOT NULL,
    category       VARCHAR(40)  NOT NULL,
    severity       VARCHAR(20)  NOT NULL,
    title          VARCHAR(200) NOT NULL,
    expected_behavior VARCHAR(1000),
    actual_behavior  VARCHAR(1000),
    reproduction_json JSONB,
    evidence_artifacts JSONB,
    ai_hypothesis  VARCHAR(2000),
    status         VARCHAR(20)  NOT NULL DEFAULT 'DETECTED',
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_bug_code UNIQUE (bug_code),
    CONSTRAINT ck_bug_category CHECK (category IN
        ('FIELD_MISSING', 'STATE_MISMATCH', 'VALUE_MISMATCH', 'DEPENDENCY_MISMATCH', 'TABLE_MISMATCH')),
    CONSTRAINT ck_bug_severity CHECK (severity IN ('HIGH', 'MEDIUM', 'LOW')),
    CONSTRAINT ck_bug_status CHECK (status IN ('DETECTED', 'CONFIRMED', 'DISMISSED'))
);

CREATE INDEX idx_bug_execution ON bug_finding (execution_id);
CREATE INDEX idx_bug_project ON bug_finding (project_id, screen_code);
CREATE INDEX idx_bug_screen ON bug_finding (screen_code, status);
