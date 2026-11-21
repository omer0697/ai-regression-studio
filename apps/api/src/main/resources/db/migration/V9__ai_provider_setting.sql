-- UI-managed AI provider settings (single row, id = 1). When present, it
-- overrides the AI_* environment variables; the API key is stored here for
-- local deployments and is never returned by any endpoint.
-- Shared/production deployments should keep using environment variables
-- and simply never write this row.

CREATE TABLE ai_provider_setting (
    id                BIGSERIAL PRIMARY KEY,
    enabled           BOOLEAN      NOT NULL DEFAULT TRUE,
    base_url          VARCHAR(500),
    model             VARCHAR(120),
    api_key           VARCHAR(500),
    timeout_seconds   INT          NOT NULL DEFAULT 60,
    max_output_tokens INT          NOT NULL DEFAULT 2048,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);
