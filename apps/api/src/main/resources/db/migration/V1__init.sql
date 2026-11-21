-- AI Regression Studio — initial schema (Phase 1)
-- Owned by Flyway; Hibernate validates mappings against these tables.

CREATE TABLE app_user (
    id            BIGSERIAL PRIMARY KEY,
    username      VARCHAR(64)  NOT NULL,
    password_hash VARCHAR(200) NOT NULL,
    display_name  VARCHAR(120) NOT NULL,
    role          VARCHAR(20)  NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ,
    CONSTRAINT uq_app_user_username UNIQUE (username),
    CONSTRAINT ck_app_user_role CHECK (role IN ('ADMIN', 'TESTER', 'VIEWER'))
);

CREATE TABLE project (
    id               BIGSERIAL PRIMARY KEY,
    name             VARCHAR(80)  NOT NULL,
    description      VARCHAR(600),
    environment_name VARCHAR(40)  NOT NULL,
    active           BOOLEAN      NOT NULL DEFAULT TRUE,
    created_by       BIGINT REFERENCES app_user (id),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_project_name UNIQUE (name)
);

CREATE INDEX idx_project_created_at ON project (created_at DESC);

CREATE TABLE application_environment (
    id                   BIGSERIAL PRIMARY KEY,
    project_id           BIGINT       NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    app_type             VARCHAR(16)  NOT NULL,
    display_name         VARCHAR(80)  NOT NULL,
    base_url             VARCHAR(500) NOT NULL,
    environment_label    VARCHAR(40)  NOT NULL,
    auth_method          VARCHAR(40)  NOT NULL,
    credential_reference VARCHAR(120),
    login_url            VARCHAR(500),
    username_selector    VARCHAR(300),
    password_selector    VARCHAR(300),
    submit_selector      VARCHAR(300),
    allowed_domains      JSONB        NOT NULL DEFAULT '[]'::jsonb,
    allowed_actions      JSONB        NOT NULL DEFAULT '["safe-exploration"]'::jsonb,
    prohibited_actions   JSONB        NOT NULL DEFAULT '["submit","publish","delete","approve","sign","send"]'::jsonb,
    browser_timeout_ms   INT          NOT NULL DEFAULT 30000,
    screenshot_enabled   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_env_project_type UNIQUE (project_id, app_type),
    CONSTRAINT ck_env_app_type CHECK (app_type IN ('LEGACY_GWT', 'REACT')),
    CONSTRAINT ck_env_auth_method CHECK (auth_method IN ('NONE', 'TEST_ACCOUNT_FORM'))
);

CREATE INDEX idx_env_project ON application_environment (project_id);

CREATE TABLE screen_definition (
    id                BIGSERIAL PRIMARY KEY,
    project_id        BIGINT       NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    screen_code       VARCHAR(32)  NOT NULL,
    name              VARCHAR(120) NOT NULL,
    legacy_route      VARCHAR(300),
    react_route       VARCHAR(300),
    navigation_notes  TEXT,
    active            BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_screen UNIQUE (project_id, screen_code)
);

CREATE INDEX idx_screen_project ON screen_definition (project_id);

CREATE TABLE test_execution (
    id             BIGSERIAL PRIMARY KEY,
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
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    started_at     TIMESTAMPTZ,
    finished_at    TIMESTAMPTZ,
    CONSTRAINT ck_exec_mode CHECK (mode IN ('DISCOVERY', 'COMPARISON')),
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
    id           BIGSERIAL PRIMARY KEY,
    execution_id BIGINT      NOT NULL REFERENCES test_execution (id) ON DELETE CASCADE,
    seq          BIGINT      NOT NULL,
    event_type   VARCHAR(16) NOT NULL,
    message      VARCHAR(1000) NOT NULL,
    payload      JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_exec_event_seq UNIQUE (execution_id, seq),
    CONSTRAINT ck_exec_event_type CHECK (event_type IN ('INFO', 'STEP', 'WARNING', 'ERROR', 'RESULT'))
);

CREATE INDEX idx_exec_event_exec ON execution_event (execution_id);

CREATE TABLE audit_event (
    id          BIGSERIAL PRIMARY KEY,
    actor       VARCHAR(64),
    action      VARCHAR(60) NOT NULL,
    target_type VARCHAR(40),
    target_id   VARCHAR(64),
    details     JSONB,
    ip_address  VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_created ON audit_event (created_at DESC);
