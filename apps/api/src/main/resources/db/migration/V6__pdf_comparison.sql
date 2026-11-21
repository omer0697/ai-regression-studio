-- Phase 6: PDF document comparison results.

CREATE TABLE pdf_comparison (
    id             BIGSERIAL PRIMARY KEY,
    project_id     BIGINT       NOT NULL REFERENCES project (id),
    execution_id   BIGINT       REFERENCES test_execution (id),
    screen_code    VARCHAR(32),
    source_a_name  VARCHAR(200) NOT NULL,
    source_b_name  VARCHAR(200) NOT NULL,
    pdf_a_key      VARCHAR(400) NOT NULL,
    pdf_b_key      VARCHAR(400) NOT NULL,
    pages_a        INT,
    pages_b        INT,
    verdict        VARCHAR(20)  NOT NULL,
    differences    JSONB        NOT NULL,
    artifact_a_id  BIGINT,
    artifact_b_id  BIGINT,
    created_by     VARCHAR(64),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_pdf_verdict CHECK (verdict IN ('MATCH', 'DIFFERENT', 'ERROR'))
);

CREATE INDEX idx_pdf_comparison_project ON pdf_comparison (project_id);
