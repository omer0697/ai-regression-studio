-- Embedded local mode: consolidated SQLite schema (SPRING_PROFILES_ACTIVE=sqlite).
--
-- This is the complete, current schema in one migration. It mirrors the final
-- state of the PostgreSQL migrations V1-V8 (no SQLite deployment exists yet,
-- so a single baseline is the honest and simplest representation).
-- Vendor differences:
--   * BIGSERIAL PRIMARY KEY -> INTEGER PRIMARY KEY AUTOINCREMENT
--   * TIMESTAMPTZ DEFAULT now() -> TEXT DEFAULT CURRENT_TIMESTAMP (values are
--     set by Hibernate @PrePersist in UTC anyway)
--   * JSONB -> TEXT (serialized by Hibernate/Jackson; see ArsSqliteDialect)

CREATE TABLE app_user (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      VARCHAR(64)  NOT NULL,
    password_hash VARCHAR(200) NOT NULL,
    display_name  VARCHAR(120) NOT NULL,
    role          VARCHAR(20)  NOT NULL,
    created_at    TEXT         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT,
    CONSTRAINT uq_app_user_username UNIQUE (username),
    CONSTRAINT ck_app_user_role CHECK (role IN ('ADMIN', 'TESTER', 'VIEWER'))
);

CREATE TABLE project (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             VARCHAR(80)  NOT NULL,
    description     VARCHAR(600),
    environment_name VARCHAR(40)  NOT NULL,
    active           BOOLEAN      NOT NULL DEFAULT 1,
    created_by       BIGINT REFERENCES app_user (id),
    created_at       TEXT         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TEXT         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_project_name UNIQUE (name)
);

CREATE INDEX idx_project_created_at ON project (created_at DESC);

CREATE TABLE application_environment (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id                BIGINT       NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    app_type                  VARCHAR(16)  NOT NULL,
    display_name              VARCHAR(80)  NOT NULL,
    base_url                  VARCHAR(500) NOT NULL,
    environment_label         VARCHAR(40)  NOT NULL,
    auth_method               VARCHAR(40)  NOT NULL,
    credential_reference      VARCHAR(120),
    login_url                 VARCHAR(500),
    username_selector         VARCHAR(300),
    password_selector          VARCHAR(300),
    submit_selector            VARCHAR(300),
    allowed_domains           TEXT         NOT NULL DEFAULT '[]',
    allowed_actions           TEXT         NOT NULL DEFAULT '["safe-exploration"]',
    prohibited_actions        TEXT         NOT NULL DEFAULT '["submit","publish","delete","approve","sign","send"]',
    browser_timeout_ms        INT          NOT NULL DEFAULT 30000,
    exploration_max_interactions INT       NOT NULL DEFAULT 12,
    exploration_max_options     INT        NOT NULL DEFAULT 3,
    screenshot_enabled        BOOLEAN      NOT NULL DEFAULT 1,
    created_at                TEXT         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                TEXT         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_env_project_type UNIQUE (project_id, app_type),
    CONSTRAINT ck_env_app_type CHECK (app_type IN ('LEGACY_GWT', 'REACT')),
    CONSTRAINT ck_env_auth_method CHECK (auth_method IN ('NONE', 'TEST_ACCOUNT_FORM')),
    CONSTRAINT ck_env_exploration_interactions CHECK (exploration_max_interactions BETWEEN 0 AND 100),
    CONSTRAINT ck_env_exploration_options CHECK (exploration_max_options BETWEEN 0 AND 20)
);

CREATE INDEX idx_env_project ON application_environment (project_id);

CREATE TABLE screen_definition (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id        BIGINT       NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    screen_code       VARCHAR(32)  NOT NULL,
    name              VARCHAR(120) NOT NULL,
    legacy_route      VARCHAR(300),
    react_route       VARCHAR(300),
    navigation_notes  TEXT,
    active            BOOLEAN      NOT NULL DEFAULT 1,
    created_at        TEXT         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TEXT         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_screen UNIQUE (project_id, screen_code)
);

CREATE INDEX idx_screen_project ON screen_definition (project_id);

CREATE TABLE test_execution (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id     BIGINT       NOT NULL REFERENCES project (id),
    screen_id      BIGINT       NOT NULL REFERENCES screen_definition (id),
    mode           VARCHAR(20)  NOT NULL,
    status         VARCHAR(24)  NOT NULL,
    error_code     VARCHAR(60),
    status_message VARCHAR(600),
    total_steps    INT          NOT NULL DEFAULT 0,
    passed_steps   INT          NOT NULL DEFAULT 0,
    failed_steps   INT          NOT NULL DEFAULT 0,
    skipped_steps  INT          NOT NULL DEFAULT 0,
    created_by     BIGINT REFERENCES app_user (id),
    created_at     TEXT         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at     TEXT,
    finished_at    TEXT,
    CONSTRAINT ck_exec_mode CHECK (mode IN ('DISCOVERY', 'COMPARISON', 'COMBINATION')),
    CONSTRAINT ck_exec_status CHECK (status IN
        ('CREATED', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'NOT_SUPPORTED', 'ERROR', 'CANCELLED'))
);

CREATE INDEX idx_exec_project ON test_execution (project_id);
CREATE INDEX idx_exec_screen ON test_execution (screen_id);
CREATE INDEX idx_exec_created ON test_execution (created_at DESC);
-- Duplicate-run prevention: at most one active execution per screen.
CREATE UNIQUE INDEX uq_exec_active_screen
    ON test_execution (screen_id)
    WHERE status IN ('CREATED', 'QUEUED', 'RUNNING');

CREATE TABLE execution_event (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id BIGINT       NOT NULL REFERENCES test_execution (id) ON DELETE CASCADE,
    seq          BIGINT       NOT NULL,
    event_type   VARCHAR(16)  NOT NULL,
    message      VARCHAR(1000) NOT NULL,
    payload      TEXT,
    created_at   TEXT         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_exec_event_seq UNIQUE (execution_id, seq),
    CONSTRAINT ck_exec_event_type CHECK (event_type IN ('INFO', 'STEP', 'WARNING', 'ERROR', 'RESULT'))
);

CREATE INDEX idx_exec_event_exec ON execution_event (execution_id);

CREATE TABLE audit_event (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    actor       VARCHAR(64),
    action      VARCHAR(60) NOT NULL,
    target_type VARCHAR(40),
    target_id   VARCHAR(64),
    details     TEXT,
    ip_address  VARCHAR(64),
    created_at TEXT        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_created ON audit_event (created_at DESC);

CREATE TABLE discovered_element (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id      BIGINT        NOT NULL REFERENCES test_execution (id) ON DELETE CASCADE,
    project_id        BIGINT        NOT NULL,
    app_type          VARCHAR(16)   NOT NULL,
    screen_code       VARCHAR(32)   NOT NULL,
    element_ref       VARCHAR(64)   NOT NULL,
    label             VARCHAR(300),
    element_type      VARCHAR(40)   NOT NULL,
    accessible_name   VARCHAR(300),
    current_value     VARCHAR(500),
    enabled           BOOLEAN       NOT NULL,
    visible           BOOLEAN       NOT NULL,
    required          BOOLEAN,
    options           TEXT,
    dom_path          VARCHAR(600),
    locator_candidates TEXT,
    confidence        NUMERIC(3, 2),
    created_at        TEXT          NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_disc_element_exec ON discovered_element (execution_id);
CREATE INDEX idx_disc_element_project ON discovered_element (project_id, app_type);

CREATE TABLE artifact (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id  BIGINT        REFERENCES test_execution (id) ON DELETE CASCADE,
    artifact_type VARCHAR(30)   NOT NULL,
    display_name  VARCHAR(200)  NOT NULL,
    storage_key   VARCHAR(400)  NOT NULL,
    mime_type     VARCHAR(100),
    byte_size     BIGINT,
    created_at    TEXT          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_artifact_type CHECK (
        artifact_type IN ('SCREENSHOT', 'TRACE', 'CONSOLE_LOG', 'NETWORK_LOG', 'PDF'))
);

CREATE INDEX idx_artifact_exec ON artifact (execution_id);

CREATE TABLE dependency_observation (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id   BIGINT        NOT NULL REFERENCES test_execution (id) ON DELETE CASCADE,
    project_id     BIGINT        NOT NULL,
    app_type       VARCHAR(16)   NOT NULL,
    screen_code    VARCHAR(32)   NOT NULL,
    source_ref     VARCHAR(64)   NOT NULL,
    source_label   VARCHAR(300),
    interaction    VARCHAR(40)   NOT NULL,
    value          VARCHAR(300),
    affected_ref   VARCHAR(64)   NOT NULL,
    affected_label VARCHAR(300),
    attribute      VARCHAR(40)   NOT NULL,
    before_value   VARCHAR(500),
    after_value    VARCHAR(500),
    reverted       BOOLEAN       NOT NULL,
    observed_at    TEXT          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_observation_interaction CHECK (interaction IN ('selectOption', 'setCheckbox', 'chooseRadio')),
    CONSTRAINT ck_observation_attribute CHECK (attribute IN ('enabled', 'visible', 'value', 'options', 'required'))
);

CREATE INDEX idx_observation_exec ON dependency_observation (execution_id);

CREATE TABLE test_scenario (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      BIGINT        NOT NULL REFERENCES project (id),
    screen_id       BIGINT        NOT NULL REFERENCES screen_definition (id),
    name            VARCHAR(120)  NOT NULL,
    description     VARCHAR(1000),
    source          VARCHAR(20)   NOT NULL,
    status          VARCHAR(20)   NOT NULL,
    plan_json       TEXT          NOT NULL,
    ai_analysis_id  BIGINT,
    proposed_by     VARCHAR(64),
    created_at      TEXT          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_by     VARCHAR(64),
    approved_at     TEXT,
    CONSTRAINT ck_scenario_source CHECK (source IN ('AI', 'EXPLORATION', 'MANUAL')),
    CONSTRAINT ck_scenario_status CHECK (status IN ('PROPOSED', 'APPROVED', 'REJECTED', 'EXECUTED'))
);

CREATE INDEX idx_scenario_project ON test_scenario (project_id);
CREATE INDEX idx_scenario_screen ON test_scenario (screen_id);

CREATE TABLE ai_analysis (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id BIGINT REFERENCES test_execution (id),
    project_id    BIGINT,
    kind          VARCHAR(30)  NOT NULL,
    model         VARCHAR(120),
    status        VARCHAR(30)  NOT NULL,
    summary       VARCHAR(2000),
    output_json   TEXT,
    created_at    TEXT          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_ai_kind CHECK (kind IN ('PLAN', 'MAPPING', 'FAILURE_ANALYSIS')),
    CONSTRAINT ck_ai_status CHECK (status IN ('OK', 'AI_NOT_CONFIGURED', 'AI_ERROR', 'AI_INVALID_RESPONSE'))
);

CREATE INDEX idx_ai_analysis_exec ON ai_analysis (execution_id);

CREATE TABLE element_mapping (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id   BIGINT        NOT NULL,
    screen_code  VARCHAR(32)   NOT NULL,
    execution_id BIGINT        NOT NULL REFERENCES test_execution (id) ON DELETE CASCADE,
    legacy_ref   VARCHAR(64)   NOT NULL,
    legacy_label VARCHAR(300),
    react_ref    VARCHAR(64),
    react_label  VARCHAR(300),
    confidence   NUMERIC(3, 2) NOT NULL,
    method       VARCHAR(20)   NOT NULL,
    needs_review BOOLEAN       NOT NULL DEFAULT 0,
    created_at   TEXT          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_mapping_method CHECK (method IN ('LABEL', 'AI', 'NONE'))
);

CREATE INDEX idx_mapping_screen ON element_mapping (project_id, screen_code);
CREATE INDEX idx_mapping_exec ON element_mapping (execution_id);

CREATE TABLE bug_finding (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    bug_code          VARCHAR(40)   NOT NULL,
    project_id        BIGINT        NOT NULL,
    execution_id      BIGINT        NOT NULL REFERENCES test_execution (id) ON DELETE CASCADE,
    screen_code       VARCHAR(32)   NOT NULL,
    category          VARCHAR(40)   NOT NULL,
    severity          VARCHAR(20)   NOT NULL,
    title             VARCHAR(200)  NOT NULL,
    expected_behavior VARCHAR(1000),
    actual_behavior   VARCHAR(1000),
    reproduction_json TEXT,
    evidence_artifacts TEXT,
    ai_hypothesis     VARCHAR(2000),
    status            VARCHAR(20)   NOT NULL DEFAULT 'DETECTED',
    created_at        TEXT          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_bug_code UNIQUE (bug_code),
    CONSTRAINT ck_bug_category CHECK (category IN
        ('FIELD_MISSING', 'STATE_MISMATCH', 'VALUE_MISMATCH', 'DEPENDENCY_MISMATCH', 'TABLE_MISMATCH')),
    CONSTRAINT ck_bug_severity CHECK (severity IN ('HIGH', 'MEDIUM', 'LOW')),
    CONSTRAINT ck_bug_status CHECK (status IN ('DETECTED', 'CONFIRMED', 'DISMISSED'))
);

CREATE INDEX idx_bug_execution ON bug_finding (execution_id);
CREATE INDEX idx_bug_project ON bug_finding (project_id, screen_code);
CREATE INDEX idx_bug_screen ON bug_finding (screen_code, status);

CREATE TABLE pdf_comparison (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id     BIGINT        NOT NULL REFERENCES project (id),
    execution_id   BIGINT REFERENCES test_execution (id),
    screen_code    VARCHAR(32),
    source_a_name  VARCHAR(200)  NOT NULL,
    source_b_name  VARCHAR(200)  NOT NULL,
    pdf_a_key      VARCHAR(400)  NOT NULL,
    pdf_b_key      VARCHAR(400)  NOT NULL,
    pages_a        INT,
    pages_b        INT,
    verdict        VARCHAR(20)   NOT NULL,
    differences    TEXT          NOT NULL,
    artifact_a_id  BIGINT,
    artifact_b_id  BIGINT,
    created_by     VARCHAR(64),
    created_at     TEXT          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_pdf_verdict CHECK (verdict IN ('MATCH', 'DIFFERENT', 'ERROR'))
);

CREATE INDEX idx_pdf_comparison_project ON pdf_comparison (project_id);

CREATE TABLE requirement_definition (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id    BIGINT        NOT NULL REFERENCES project (id),
    screen_code   VARCHAR(32)   NOT NULL,
    confluence_id VARCHAR(120),
    title         VARCHAR(300)  NOT NULL,
    content       TEXT,
    source_url    VARCHAR(500),
    status        VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    coverage_json TEXT,
    created_at   TEXT          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_req_status CHECK (status IN ('PENDING', 'VERIFIED', 'UNSATISFIED', 'PARTIAL', 'MANUAL_REVIEW'))
);

CREATE INDEX idx_req_screen ON requirement_definition (project_id, screen_code);

CREATE TABLE chat_message (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id BIGINT        NOT NULL REFERENCES project (id),
    role       VARCHAR(10)   NOT NULL,
    content    TEXT          NOT NULL,
    created_at TEXT          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_chat_role CHECK (role IN ('USER', 'ASSISTANT'))
);

CREATE INDEX idx_chat_project ON chat_message (project_id, created_at);

-- UI-managed AI provider settings (single row, id = 1). When present, it
-- overrides the AI_* environment variables; the API key is stored here for
-- local deployments and is never returned by any endpoint.
CREATE TABLE ai_provider_setting (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    enabled           BOOLEAN      NOT NULL DEFAULT 1,
    base_url          VARCHAR(500),
    model             VARCHAR(120),
    api_key           VARCHAR(500),
    timeout_seconds   INT          NOT NULL DEFAULT 60,
    max_output_tokens INT          NOT NULL DEFAULT 2048,
    created_at        TEXT         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TEXT        NOT NULL DEFAULT CURRENT_TIMESTAMP
);
