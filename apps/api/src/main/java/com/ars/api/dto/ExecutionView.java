package com.ars.api.dto;

import java.time.Instant;

import com.ars.api.domain.enums.ExecutionMode;
import com.ars.api.domain.enums.ExecutionStatus;

/**
 * Read model for executions, joined with project/screen/user names.
 * Used directly as the API response shape.
 */
public record ExecutionView(
        Long id,
        Long projectId,
        String projectName,
        Long screenId,
        String screenCode,
        String screenName,
        ExecutionMode mode,
        ExecutionStatus status,
        String errorCode,
        String statusMessage,
        int totalSteps,
        int passedSteps,
        int failedSteps,
        int skippedSteps,
        String createdBy,
        Instant createdAt,
        Instant startedAt,
        Instant finishedAt) {

    public static ExecutionView of(
            Long id, Long projectId, String projectName, Long screenId, String screenCode,
            String screenName, ExecutionMode mode, ExecutionStatus status, String errorCode,
            String statusMessage, int totalSteps, int passedSteps, int failedSteps,
            int skippedSteps, String createdBy, Instant createdAt, Instant startedAt,
            Instant finishedAt) {
        return new ExecutionView(id, projectId, projectName, screenId, screenCode, screenName,
                mode, status, errorCode, statusMessage, totalSteps, passedSteps, failedSteps,
                skippedSteps, createdBy, createdAt, startedAt, finishedAt);
    }

    public ExecutionView withStatus(ExecutionStatus newStatus, String newErrorCode,
            String newStatusMessage, Instant newFinishedAt) {
        return new ExecutionView(id, projectId, projectName, screenId, screenCode, screenName,
                mode, newStatus, newErrorCode, newStatusMessage, totalSteps, passedSteps,
                failedSteps, skippedSteps, createdBy, createdAt, startedAt, newFinishedAt);
    }
}
