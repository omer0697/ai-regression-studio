package com.ars.api.dto.worker;

import com.ars.api.domain.enums.ExecutionMode;

/**
 * Discover job handed to the browser worker.
 * Phase 2 will add an "execute" job type carrying a validated scenario plan.
 */
public record WorkerDiscoverJobPayload(
        String jobType,
        Long executionId,
        Long projectId,
        String screenCode,
        String screenName,
        ExecutionMode mode,
        WorkerEnvironmentPayload legacyApp,
        WorkerEnvironmentPayload reactApp) {

    public WorkerDiscoverJobPayload {
        jobType = "discover";
    }
}
