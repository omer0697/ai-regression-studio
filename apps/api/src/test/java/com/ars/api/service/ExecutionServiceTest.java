package com.ars.api.service;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.ars.api.domain.entity.ApplicationEnvironment;
import com.ars.api.domain.entity.Project;
import com.ars.api.domain.entity.ScreenDefinition;
import com.ars.api.domain.entity.TestExecution;
import com.ars.api.domain.enums.AppType;
import com.ars.api.domain.enums.ExecutionEventType;
import com.ars.api.domain.enums.ExecutionMode;
import com.ars.api.domain.enums.ExecutionStatus;
import com.ars.api.domain.repository.ApplicationEnvironmentRepository;
import com.ars.api.domain.repository.ProjectRepository;
import com.ars.api.domain.repository.ScreenDefinitionRepository;
import com.ars.api.domain.repository.TestExecutionRepository;
import com.ars.api.dto.ExecutionView;
import com.ars.api.web.ApiException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The execution flow must report honest outcomes: when the worker is not
 * configured or lacks the capability, the execution ends as NOT_SUPPORTED /
 * ERROR — never as a pass.
 */
@ExtendWith(MockitoExtension.class)
class ExecutionServiceTest {

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ScreenDefinitionRepository screenRepository;

    @Mock
    private ApplicationEnvironmentRepository environmentRepository;

    @Mock
    private TestExecutionRepository executionRepository;

    @Mock
    private ExecutionEventService events;

    @Mock
    private AuditService audit;

    @Mock
    private WorkerClient workerClient;

    @InjectMocks
    private ExecutionService service;

    private Project project;
    private ScreenDefinition screen;
    private ApplicationEnvironment gwtEnvironment;
    private ApplicationEnvironment reactEnvironment;

    @BeforeEach
    void setUp() throws Exception {
        project = new Project("KAP Migration", null, "TEST", null);
        setId(project, 1L);

        screen = new ScreenDefinition(1L, "KPY68", "Parametre Tanımları");
        setId(screen, 5L);

        gwtEnvironment = new ApplicationEnvironment(1L, AppType.LEGACY_GWT,
                "KAP GWT (TEST)", "https://gwt.kap-test.example.com", "TEST");
        setId(gwtEnvironment, 10L);

        reactEnvironment = new ApplicationEnvironment(1L, AppType.REACT,
                "KAP React (TEST)", "https://react.kap-test.example.com", "TEST");
        setId(reactEnvironment, 11L);
    }

    @Test
    void start_workerNotConfigured_endsNotSupportedWithErrorCode() {
        arrangeHappyPath();
        when(workerClient.dispatchDiscover(any())).thenReturn(new WorkerClient.DispatchOutcome(
                WorkerClient.OutcomeState.NOT_SUPPORTED,
                "WORKER_NOT_CONFIGURED",
                "Browser worker base URL is not configured (ARS_WORKER_BASE_URL)."));

        ExecutionView view = service.start(1L, 5L, ExecutionMode.DISCOVERY, "tester");

        assertThat(view.status()).isEqualTo(ExecutionStatus.NOT_SUPPORTED);
        assertThat(view.errorCode()).isEqualTo("WORKER_NOT_CONFIGURED");
        assertThat(view.finishedAt()).isNotNull();
        assertThat(view.passedSteps()).isZero();
        assertThat(view.failedSteps()).isZero();

        verify(events).append(anyLong(), eq(ExecutionEventType.ERROR), any(String.class),
                eq("errorCode"), eq("WORKER_NOT_CONFIGURED"));
        verify(audit).record(eq("tester"), eq("EXECUTION_NOT_SUPPORTED"), any(), any(), any());
    }

    @Test
    void start_workerCapabilityMissing_endsNotSupported() {
        arrangeHappyPath();
        when(workerClient.dispatchDiscover(any())).thenReturn(new WorkerClient.DispatchOutcome(
                WorkerClient.OutcomeState.NOT_SUPPORTED,
                "WORKER_CAPABILITY_NOT_IMPLEMENTED",
                "Browser automation is planned for Phase 2."));

        ExecutionView view = service.start(1L, 5L, ExecutionMode.DISCOVERY, "tester");

        assertThat(view.status()).isEqualTo(ExecutionStatus.NOT_SUPPORTED);
        assertThat(view.errorCode()).isEqualTo("WORKER_CAPABILITY_NOT_IMPLEMENTED");
    }

    @Test
    void start_workerUnavailable_endsError() {
        arrangeHappyPath();
        when(workerClient.dispatchDiscover(any())).thenReturn(new WorkerClient.DispatchOutcome(
                WorkerClient.OutcomeState.ERROR,
                "WORKER_UNAVAILABLE",
                "Connection refused."));

        ExecutionView view = service.start(1L, 5L, ExecutionMode.DISCOVERY, "tester");

        assertThat(view.status()).isEqualTo(ExecutionStatus.ERROR);
        assertThat(view.errorCode()).isEqualTo("WORKER_UNAVAILABLE");
        verify(events).append(anyLong(), eq(ExecutionEventType.ERROR), any(String.class),
                eq("errorCode"), eq("WORKER_UNAVAILABLE"));
    }

    @Test
    void start_activeExecutionExists_throwsConflict() {
        when(projectRepository.findByIdAndActiveTrue(1L)).thenReturn(Optional.of(project));
        when(screenRepository.findByIdAndProjectId(5L, 1L)).thenReturn(Optional.of(screen));
        when(executionRepository.existsByScreenIdAndStatusIn(eq(5L), any()))
                .thenReturn(true);

        assertThatThrownBy(() -> service.start(1L, 5L, ExecutionMode.DISCOVERY, "tester"))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("code", "EXECUTION_ALREADY_RUNNING");
    }

    @Test
    void start_comparisonWithoutReactEnvironment_throwsConflict() {
        when(projectRepository.findByIdAndActiveTrue(1L)).thenReturn(Optional.of(project));
        when(screenRepository.findByIdAndProjectId(5L, 1L)).thenReturn(Optional.of(screen));
        when(executionRepository.existsByScreenIdAndStatusIn(eq(5L), any())).thenReturn(false);
        when(environmentRepository.findByProjectIdAndAppType(1L, AppType.LEGACY_GWT))
                .thenReturn(Optional.of(gwtEnvironment));
        when(environmentRepository.findByProjectIdAndAppType(1L, AppType.REACT))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.start(1L, 5L, ExecutionMode.COMPARISON, "tester"))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("code", "ENVIRONMENT_MISSING");
    }

    @Test
    void start_queuedByWorker_marksQueued() {
        arrangeHappyPath();
        when(workerClient.dispatchDiscover(any())).thenReturn(
                WorkerClient.DispatchOutcome.queued());

        ExecutionView view = service.start(1L, 5L, ExecutionMode.DISCOVERY, "tester");

        assertThat(view.status()).isEqualTo(ExecutionStatus.QUEUED);
        assertThat(view.finishedAt()).isNull();
    }

    private void arrangeHappyPath() {
        when(projectRepository.findByIdAndActiveTrue(1L)).thenReturn(Optional.of(project));
        when(screenRepository.findByIdAndProjectId(5L, 1L)).thenReturn(Optional.of(screen));
        when(executionRepository.existsByScreenIdAndStatusIn(eq(5L), any())).thenReturn(false);
        when(environmentRepository.findByProjectIdAndAppType(1L, AppType.LEGACY_GWT))
                .thenReturn(Optional.of(gwtEnvironment));
        when(environmentRepository.findByProjectIdAndAppType(1L, AppType.REACT))
                .thenReturn(Optional.of(reactEnvironment));
        when(executionRepository.save(any(TestExecution.class)))
                .thenAnswer(invocation -> {
                    TestExecution execution = invocation.getArgument(0);
                    setId(execution, 99L);
                    return execution;
                });
    }

    private static void setId(Object entity, long id) throws Exception {
        var field = entity.getClass().getDeclaredField("id");
        field.setAccessible(true);
        field.set(entity, id);
    }
}
