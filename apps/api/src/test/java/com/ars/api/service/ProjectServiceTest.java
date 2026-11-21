package com.ars.api.service;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.ars.api.domain.entity.Project;
import com.ars.api.domain.repository.ApplicationEnvironmentRepository;
import com.ars.api.domain.repository.ProjectRepository;
import com.ars.api.domain.repository.ScreenDefinitionRepository;
import com.ars.api.domain.repository.TestExecutionRepository;
import com.ars.api.dto.ProjectCreateRequest;
import com.ars.api.dto.ProjectResponse;
import com.ars.api.web.ApiException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProjectServiceTest {

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ApplicationEnvironmentRepository environmentRepository;

    @Mock
    private ScreenDefinitionRepository screenRepository;

    @Mock
    private TestExecutionRepository executionRepository;

    @Mock
    private AuditService auditService;

    @InjectMocks
    private ProjectService service;

    @Test
    void create_withDuplicateName_throwsConflict() {
        when(projectRepository.existsByNameIgnoreCase("KAP Migration")).thenReturn(true);

        assertThatThrownBy(() -> service.create(
                new ProjectCreateRequest("KAP Migration", null, "TEST"), "admin"))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("code", "PROJECT_NAME_EXISTS");

        verify(projectRepository, never()).save(any());
    }

    @Test
    void create_persistsProjectAndAudits() {
        when(projectRepository.existsByNameIgnoreCase("KAP Migration")).thenReturn(false);
        when(projectRepository.save(any(Project.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(environmentRepository.countByProjectId(any())).thenReturn(0L);
        when(screenRepository.countByProjectId(any())).thenReturn(0L);
        when(executionRepository.countByProjectId(any())).thenReturn(0L);
        when(environmentRepository.findByProjectIdOrderByAppTypeAsc(any()))
                .thenReturn(java.util.List.of());
        when(screenRepository.findByProjectIdOrderByScreenCodeAsc(any()))
                .thenReturn(java.util.List.of());

        ProjectResponse response = service.create(
                new ProjectCreateRequest("KAP Migration", "KAP migration", "TEST"), "admin");

        assertThat(response.name()).isEqualTo("KAP Migration");
        assertThat(response.environmentName()).isEqualTo("TEST");
        assertThat(response.environments()).isEmpty();
        verify(auditService).record(
                org.mockito.ArgumentMatchers.eq("admin"),
                org.mockito.ArgumentMatchers.eq("PROJECT_CREATED"),
                org.mockito.ArgumentMatchers.eq("PROJECT"),
                any(),
                any());
    }

    @Test
    void get_unknownProject_throwsNotFound() {
        when(projectRepository.findByIdAndActiveTrue(42L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.get(42L))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("code", "PROJECT_NOT_FOUND");
    }
}
