package com.ars.api.dto.worker;

import com.ars.api.domain.enums.ExecutionMode;

/**
 * V8 user-driven: full-combination testing job. The worker fills every
 * discovered field with every bounded combination in BOTH apps, reloading
 * between combinations, and reports per-field state differences.
 */
public record WorkerCombinationJobPayload(
        String jobType,
        Long executionId,
        Long projectId,
        String screenCode,
        String screenName,
        ExecutionMode mode,
        int maxCombinations,
        WorkerEnvironmentPayload legacyApp,
        WorkerEnvironmentPayload reactApp) {

    public WorkerCombinationJobPayload {
        jobType = "combine";
        mode = ExecutionMode.COMBINATION;
    }

    /** Reuses the comparison dispatch path (same transport shape family). */
    public WorkerComparisonJobPayload toComparisonShape() {
        return new WorkerComparisonJobPayload(
                "combine",
                executionId,
                projectId,
                screenCode,
                screenName,
                ExecutionMode.COMBINATION,
                java.util.Map.of(
                        "scenarioName", "Full combination testing",
                        "screen", screenCode,
                        "steps", java.util.List.of()),
                legacyApp,
                reactApp,
                java.util.List.of());
    }
}
