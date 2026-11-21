-- Phase 2: discovery results and evidence artifacts.

CREATE TABLE discovered_element (
    id              BIGSERIAL PRIMARY KEY,
    execution_id    BIGINT       NOT NULL REFERENCES test_execution (id) ON DELETE CASCADE,
    project_id      BIGINT       NOT NULL,
    app_type        VARCHAR(16)  NOT NULL,
    screen_code     VARCHAR(32)  NOT NULL,
    element_ref     VARCHAR(64)   NOT NULL,
    label           VARCHAR(300),
    element_type    VARCHAR(40)  NOT NULL,
    accessible_name VARCHAR(300),
    current_value   VARCHAR(500),
    enabled         BOOLEAN      NOT NULL,
    visible         BOOLEAN      NOT NULL,
    required        BOOLEAN,
    options         JSONB,
    dom_path        VARCHAR(600),
    confidence      NUMERIC(3, 2),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_disc_element_exec ON discovered_element (execution_id);
CREATE INDEX idx_disc_element_project ON discovered_element (project_id, app_type);

CREATE TABLE artifact (
    id           BIGSERIAL PRIMARY KEY,
    execution_id BIGINT       NOT NULL REFERENCES test_execution (id) ON DELETE CASCADE,
    artifact_type VARCHAR(30) NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    storage_key  VARCHAR(400) NOT NULL,
    mime_type    VARCHAR(100),
    byte_size    BIGINT,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_artifact_type CHECK (artifact_type IN ('SCREENSHOT', 'TRACE', 'CONSOLE_LOG', 'NETWORK_LOG'))
);

CREATE INDEX idx_artifact_exec ON artifact (execution_id);
