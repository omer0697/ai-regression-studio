package com.ars.api.service;

import java.time.Instant;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ars.api.domain.entity.TestExecution;
import com.ars.api.domain.enums.ExecutionStatus;
import com.ars.api.domain.repository.TestExecutionRepository;
import com.ars.api.dto.ExecutionView;
import com.ars.api.dto.InternalDtos.InternalStatusRequest;
import com.ars.api.web.ApiException;

/**
 * Applies worker status callbacks to executions.
 *
 * <p>Terminal states are idempotent: a repeated terminal callback is a no-op
 * instead of an error, and a transition out of a terminal state is refused.</p>
 */
@Service
public class ExecutionProgressService {

    private final TestExecutionRepository executionRepository;
    private final AuditService audit;

    public ExecutionProgressService(TestExecutionRepository executionRepository, AuditService audit) {
        this.executionRepository = executionRepository;
        this.audit = audit;
    }

    @Transactional
    public ExecutionView applyStatus(Long executionId, InternalStatusRequest request) {
        TestExecution execution = executionRepository.findById(executionId)
                .orElseThrow(() -> ApiException.notFound("EXECUTION_NOT_FOUND",
                        "Execution %d does not exist.".formatted(executionId)));

        ExecutionStatus next = parseStatus(request.status());

        if (execution.getStatus().isTerminal()) {
            // Idempotent no-op: the worker may retry a terminal callback.
            return currentView(execution, executionRepository.findByIdWithNames(executionId));
        }
        if (next == ExecutionStatus.CREATED) {
            throw ApiException.conflict("INVALID_STATE_TRANSITION",
                    "An execution cannot transition back to CREATED.");
        }

        execution.setStatus(next);
        if (request.statusMessage() != null) {
            execution.setStatusMessage(truncate(request.statusMessage()));
        }
        if (request.errorCode() != null) {
            execution.setErrorCode(truncate(request.errorCode()));
        }
        if (request.totalSteps() != null) {
            execution.setTotalSteps(request.totalSteps());
        }
        if (request.passedSteps() != null) {
            execution.setPassedSteps(request.passedSteps());
        }
        if (request.failedSteps() != null) {
            execution.setFailedSteps(request.failedSteps());
        }
        if (request.skippedSteps() != null) {
            execution.setSkippedSteps(request.skippedSteps());
        }
        if (next == ExecutionStatus.RUNNING && execution.getStartedAt() == null) {
            execution.setStartedAt(Instant.now());
        }
        if (next.isTerminal() && execution.getFinishedAt() == null) {
            execution.setFinishedAt(Instant.now());
        }
        executionRepository.save(execution);

        audit.record("browser-worker", "EXECUTION_STATUS_UPDATED", "TEST_EXECUTION",
                String.valueOf(executionId), java.util.Map.of("status", next.name()));

        return currentView(execution, executionRepository.findByIdWithNames(executionId));
    }

    private ExecutionStatus parseStatus(String raw) {
        try {
            return ExecutionStatus.valueOf(raw);
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw ApiException.badRequest("INVALID_STATUS",
                    "Unknown execution status: %s".formatted(raw));
        }
    }

    private ExecutionView currentView(TestExecution execution,
            java.util.Optional<ExecutionView> joined) {
        return joined.orElseGet(() -> new ExecutionView(
                execution.getId(),
                execution.getProjectId(),
                null,
                execution.getScreenId(),
                null,
                null,
                execution.getMode(),
                execution.getStatus(),
                execution.getErrorCode(),
                execution.getStatusMessage(),
                execution.getTotalSteps(),
                execution.getPassedSteps(),
                execution.getFailedSteps(),
                execution.getSkippedSteps(),
                null,
                execution.getCreatedAt(),
                execution.getStartedAt(),
                execution.getFinishedAt()));
    }

    private String truncate(String value) {
        return value.length() > 600 ? value.substring(0, 597) + "..." : value;
    }
}
