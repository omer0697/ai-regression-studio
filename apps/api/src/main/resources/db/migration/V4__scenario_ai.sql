-- Phase 4: AI-generated scenario plans and AI analysis records.

CREATE TABLE test_scenario (
    id           BIGSERIAL PRIMARY KEY,
    project_id   BIGINT       NOT NULL REFERENCES project (id),
    screen_id    BIGINT       NOT NULL REFERENCES screen_definition (id),
    name         VARCHAR(120) NOT NULL,
    description  VARCHAR(1000),
    source       VARCHAR(20)  NOT NULL,
    status       VARCHAR(20)  NOT NULL,
    plan_json    JSONB        NOT NULL,
    ai_analysis_id BIGINT,
    proposed_by  VARCHAR(64),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    approved_by  VARCHAR(64),
    approved_at  TIMESTAMPTZ,
    CONSTRAINT ck_scenario_source CHECK (source IN ('AI', 'EXPLORATION', 'MANUAL')),
    CONSTRAINT ck_scenario_status CHECK (status IN ('PROPOSED', 'APPROVED', 'REJECTED', 'EXECUTED'))
);

CREATE INDEX idx_scenario_project ON test_scenario (project_id);
CREATE INDEX idx_scenario_screen ON test_scenario (screen_id);

CREATE TABLE ai_analysis (
    id             BIGSERIAL PRIMARY KEY,
    execution_id   BIGINT REFERENCES test_execution (id),
    project_id     BIGINT,
    kind           VARCHAR(30) NOT NULL,
    model          VARCHAR(120),
    status         VARCHAR(30) NOT NULL,
    summary        VARCHAR(2000),
    output_json    JSONB,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_ai_kind CHECK (kind IN ('PLAN', 'MAPPING', 'FAILURE_ANALYSIS')),
    CONSTRAINT ck_ai_status CHECK (status IN ('OK', 'AI_NOT_CONFIGURED', 'AI_ERROR', 'AI_INVALID_RESPONSE'))
);

CREATE INDEX idx_ai_analysis_exec ON ai_analysis (execution_id);
