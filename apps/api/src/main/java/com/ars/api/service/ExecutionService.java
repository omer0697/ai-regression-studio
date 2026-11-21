package com.ars.api.service;

import org.springframework.stereotype.Service;

import com.ars.api.domain.entity.Project;
import com.ars.api.domain.entity.ScreenDefinition;
import com.ars.api.domain.entity.TestExecution;
import com.ars.api.domain.enums.AppType;
import com.ars.api.domain.enums.ExecutionMode;
import com.ars.api.domain.enums.ExecutionStatus;
import com.ars.api.domain.repository.ApplicationEnvironmentRepository;
import com.ars.api.domain.repository.ProjectRepository;
import com.ars.api.domain.repository.ScreenDefinitionRepository;
import com.ars.api.domain.repository.TestExecutionRepository;
import com.ars.api.dto.ExecutionView;
import com.ars.api.web.ApiException;

/**
 * Starts test executions, dispatches them to the browser worker and records
 * honest outcomes. In Phase 1 the worker answers 501, so executions end as
 * NOT_SUPPORTED with a machine-readable error code — never as a fake pass.
 */
@Service
public class ExecutionService {

    private static final java.util.List<ExecutionStatus> ACTIVE_STATUSES =
            java.util.List.of(ExecutionStatus.CREATED, ExecutionStatus.QUEUED, ExecutionStatus.RUNNING);

    private final ProjectRepository projectRepository;
    private final ScreenDefinitionRepository screenRepository;
    private final ApplicationEnvironmentRepository environmentRepository;
    private final TestExecutionRepository executionRepository;
    private final ExecutionEventService events;
    private final AuditService audit;
    private final WorkerClient workerClient;

    public ExecutionService(
            ProjectRepository projectRepository,
            ScreenDefinitionRepository screenRepository,
            ApplicationEnvironmentRepository environmentRepository,
            TestExecutionRepository executionRepository,
            ExecutionEventService events,
            AuditService audit,
            WorkerClient workerClient) {
        this.projectRepository = projectRepository;
        this.screenRepository = screenRepository;
        this.environmentRepository = environmentRepository;
        this.executionRepository = executionRepository;
        this.events = events;
        this.audit = audit;
        this.workerClient = workerClient;
    }

    public ExecutionView start(Long projectId, Long screenId, ExecutionMode mode, String actor) {
        Project project = projectRepository.findByIdAndActiveTrue(projectId)
                .orElseThrow(() -> ApiException.notFound("PROJECT_NOT_FOUND",
                        "Project %d does not exist or is not active.".formatted(projectId)));

        ScreenDefinition screen = screenRepository.findByIdAndProjectId(screenId, projectId)
                .orElseThrow(() -> ApiException.notFound("SCREEN_NOT_FOUND",
                        "Screen %d does not belong to project %d.".formatted(screenId, projectId)));

        if (executionRepository.existsByScreenIdAndStatusIn(screen.getId(), ACTIVE_STATUSES)) {
            throw ApiException.conflict("EXECUTION_ALREADY_RUNNING",
                    "Another execution is already active for screen %s.".formatted(screen.getScreenCode()));
        }

        var legacyEnvironment = environmentRepository
                .findByProjectIdAndAppType(projectId, AppType.LEGACY_GWT)
                .orElseThrow(() -> ApiException.conflict("ENVIRONMENT_MISSING",
                        "A LEGACY_GWT environment must be configured before running executions."));
        var reactEnvironment = environmentRepository
                .findByProjectIdAndAppType(projectId, AppType.REACT)
                .orElse(null);

        if (mode == ExecutionMode.COMPARISON && reactEnvironment == null) {
            throw ApiException.conflict("ENVIRONMENT_MISSING",
                    "COMPARISON mode requires both LEGACY_GWT and REACT environments.");
        }

        TestExecution execution = executionRepository
                .save(new TestExecution(project.getId(), screen.getId(), mode, null));
        events.append(execution.getId(),
                com.ars.api.domain.enums.ExecutionEventType.INFO,
                "Execution created for screen %s (mode: %s).".formatted(screen.getScreenCode(), mode));
        audit.record(actor, "EXECUTION_STARTED", "TEST_EXECUTION",
                String.valueOf(execution.getId()),
                java.util.Map.of("screen", screen.getScreenCode(), "mode", mode.name()));

        events.append(execution.getId(),
                com.ars.api.domain.enums.ExecutionEventType.INFO,
                "Dispatching job to the browser worker.");

        var payload = new com.ars.api.dto.worker.WorkerDiscoverJobPayload(
                "discover",
                execution.getId(),
                project.getId(),
                screen.getScreenCode(),
                screen.getName(),
                mode,
                com.ars.api.dto.worker.WorkerEnvironmentPayload.from(legacyEnvironment),
                reactEnvironment == null ? null
                        : com.ars.api.dto.worker.WorkerEnvironmentPayload.from(reactEnvironment));

        WorkerClient.DispatchOutcome outcome = workerClient.dispatchDiscover(payload);

        return switch (outcome.state()) {
            case QUEUED -> markQueued(execution, project, screen);
            case NOT_SUPPORTED -> markNotSupported(execution, project, screen, outcome, actor);
            case ERROR -> markWorkerError(execution, project, screen, outcome, actor);
        };
    }

    private ExecutionView markQueued(TestExecution execution, Project project, ScreenDefinition screen) {
        execution.setStatus(ExecutionStatus.QUEUED);
        executionRepository.save(execution);
        return toView(execution, project, screen, null);
    }

    private ExecutionView markNotSupported(TestExecution execution, Project project,
            ScreenDefinition screen, WorkerClient.DispatchOutcome outcome, String actor) {
        execution.setStatus(ExecutionStatus.NOT_SUPPORTED);
        execution.setErrorCode(outcome.errorCode());
        execution.setStatusMessage(truncate(outcome.detail()));
        execution.setFinishedAt(java.time.Instant.now());
        executionRepository.save(execution);

        events.append(execution.getId(),
                com.ars.api.domain.enums.ExecutionEventType.ERROR,
                "Execution cannot proceed: %s".formatted(outcome.errorCode()),
                "errorCode", outcome.errorCode());
        audit.record(actor, "EXECUTION_NOT_SUPPORTED", "TEST_EXECUTION",
                String.valueOf(execution.getId()),
                java.util.Map.of("errorCode", outcome.errorCode()));

        return toView(execution, project, screen, outcome.errorCode());
    }

    private ExecutionView markWorkerError(TestExecution execution, Project project,
            ScreenDefinition screen, WorkerClient.DispatchOutcome outcome, String actor) {
        execution.setStatus(ExecutionStatus.ERROR);
        execution.setErrorCode(outcome.errorCode());
        execution.setStatusMessage(truncate(outcome.detail()));
        execution.setFinishedAt(java.time.Instant.now());
        executionRepository.save(execution);

        events.append(execution.getId(),
                com.ars.api.domain.enums.ExecutionEventType.ERROR,
                "Worker dispatch failed: %s".formatted(outcome.errorCode()),
                "errorCode", outcome.errorCode());
        audit.record(actor, "EXECUTION_WORKER_ERROR", "TEST_EXECUTION",
                String.valueOf(execution.getId()),
                java.util.Map.of("errorCode", outcome.errorCode()));

        return toView(execution, project, screen, outcome.errorCode());
    }

    private ExecutionView toView(TestExecution execution, Project project, ScreenDefinition screen,
            String errorCodeOverride) {
        return new ExecutionView(
                execution.getId(),
                project.getId(),
                project.getName(),
                screen.getId(),
                screen.getScreenCode(),
                screen.getName(),
                execution.getMode(),
                execution.getStatus(),
                errorCodeOverride != null ? errorCodeOverride : execution.getErrorCode(),
                execution.getStatusMessage(),
                execution.getTotalSteps(),
                execution.getPassedSteps(),
                execution.getFailedSteps(),
                execution.getSkippedSteps(),
                null,
                execution.getCreatedAt(),
                execution.getStartedAt(),
                execution.getFinishedAt());
    }

    private String truncate(String value) {
        if (value == null) {
            return null;
        }
        return value.length() > 600 ? value.substring(0, 597) + "..." : value;
    }
}
