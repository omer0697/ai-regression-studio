package com.ars.api.dto.worker;

import java.util.List;
import java.util.Map;

import com.ars.api.domain.enums.ExecutionMode;

/** Phase 5 job: run an equivalent plan in both apps and compare behavior. */
public record WorkerComparisonJobPayload(
        String jobType,
        Long executionId,
        Long projectId,
        String screenCode,
        String screenName,
        ExecutionMode mode,
        Map<String, Object> plan,
        WorkerEnvironmentPayload legacyApp,
        WorkerEnvironmentPayload reactApp,
        List<MappingHintPayload> mapping) {

    public WorkerComparisonJobPayload {
        jobType = "compare";
        mode = ExecutionMode.COMPARISON;
    }

    public record MappingHintPayload(
            String legacyRef,
            String legacyLabel,
            String reactRef,
            String reactLabel,
            double confidence,
            boolean needsReview) {
    }
}
