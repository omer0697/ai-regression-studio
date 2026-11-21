-- Phase 3: dependency observations, exploration budgets and locator candidates.

CREATE TABLE dependency_observation (
    id            BIGSERIAL PRIMARY KEY,
    execution_id  BIGINT       NOT NULL REFERENCES test_execution (id) ON DELETE CASCADE,
    project_id    BIGINT       NOT NULL,
    app_type      VARCHAR(16)  NOT NULL,
    screen_code   VARCHAR(32)  NOT NULL,
    source_ref    VARCHAR(64)  NOT NULL,
    source_label  VARCHAR(300),
    interaction   VARCHAR(40)  NOT NULL,
    value         VARCHAR(300),
    affected_ref  VARCHAR(64)  NOT NULL,
    affected_label VARCHAR(300),
    attribute     VARCHAR(40)  NOT NULL,
    before_value  VARCHAR(500),
    after_value   VARCHAR(500),
    reverted      BOOLEAN      NOT NULL,
    observed_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_observation_interaction CHECK (interaction IN ('selectOption', 'setCheckbox', 'chooseRadio')),
    CONSTRAINT ck_observation_attribute CHECK (attribute IN ('enabled', 'visible', 'value', 'options', 'required'))
);

CREATE INDEX idx_observation_exec ON dependency_observation (execution_id);

ALTER TABLE discovered_element
    ADD COLUMN locator_candidates JSONB;

ALTER TABLE application_environment
    ADD COLUMN exploration_max_interactions INT NOT NULL DEFAULT 12,
    ADD COLUMN exploration_max_options INT NOT NULL DEFAULT 3,
    ADD CONSTRAINT ck_env_exploration_interactions CHECK (exploration_max_interactions BETWEEN 0 AND 100),
    ADD CONSTRAINT ck_env_exploration_options CHECK (exploration_max_options BETWEEN 0 AND 20);
