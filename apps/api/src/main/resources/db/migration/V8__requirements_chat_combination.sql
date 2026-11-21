-- User-driven extension: Confluence requirements, chat, full-combination testing.

CREATE TABLE requirement_definition (
    id            BIGSERIAL PRIMARY KEY,
    project_id    BIGINT       NOT NULL REFERENCES project (id),
    screen_code   VARCHAR(32)  NOT NULL,
    confluence_id VARCHAR(120),
    title         VARCHAR(300) NOT NULL,
    content       TEXT,
    source_url    VARCHAR(500),
    status        VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    coverage_json JSONB,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_req_status CHECK (status IN ('PENDING', 'VERIFIED', 'UNSATISFIED', 'PARTIAL', 'MANUAL_REVIEW'))
);

CREATE INDEX idx_req_screen ON requirement_definition (project_id, screen_code);

CREATE TABLE chat_message (
    id         BIGSERIAL PRIMARY KEY,
    project_id BIGINT      NOT NULL REFERENCES project (id),
    role       VARCHAR(10) NOT NULL,
    content    TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_chat_role CHECK (role IN ('USER', 'ASSISTANT'))
);

CREATE INDEX idx_chat_project ON chat_message (project_id, created_at);

ALTER TABLE test_execution DROP CONSTRAINT ck_exec_mode;
ALTER TABLE test_execution ADD CONSTRAINT ck_exec_mode CHECK (mode IN
    ('DISCOVERY', 'COMPARISON', 'COMBINATION'));
