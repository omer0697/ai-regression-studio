package com.ars.api.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ars.api.domain.entity.Project;
import com.ars.api.domain.repository.ApplicationEnvironmentRepository;
import com.ars.api.domain.repository.ProjectRepository;
import com.ars.api.domain.repository.ScreenDefinitionRepository;
import com.ars.api.domain.repository.TestExecutionRepository;
import com.ars.api.dto.ProjectCreateRequest;
import com.ars.api.dto.ProjectResponse;
import com.ars.api.dto.ProjectSummaryResponse;
import com.ars.api.dto.ProjectUpdateRequest;
import com.ars.api.dto.ScreenResponse;
import com.ars.api.dto.EnvironmentResponse;
import com.ars.api.web.ApiException;

@Service
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final ApplicationEnvironmentRepository environmentRepository;
    private final ScreenDefinitionRepository screenRepository;
    private final TestExecutionRepository executionRepository;
    private final AuditService audit;

    public ProjectService(
            ProjectRepository projectRepository,
            ApplicationEnvironmentRepository environmentRepository,
            ScreenDefinitionRepository screenRepository,
            TestExecutionRepository executionRepository,
            AuditService audit) {
        this.projectRepository = projectRepository;
        this.environmentRepository = environmentRepository;
        this.screenRepository = screenRepository;
        this.executionRepository = executionRepository;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<ProjectSummaryResponse> list() {
        return projectRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(project -> new ProjectSummaryResponse(
                        project.getId(),
                        project.getName(),
                        project.getDescription(),
                        project.getEnvironmentName(),
                        project.isActive(),
                        project.getCreatedAt(),
                        environmentRepository.countByProjectId(project.getId()),
                        screenRepository.countByProjectId(project.getId()),
                        executionRepository.countByProjectId(project.getId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public ProjectResponse get(Long id) {
        Project project = requireActiveProject(id);
        return toDetail(project);
    }

    @Transactional
    public ProjectResponse create(ProjectCreateRequest request, String actor) {
        if (projectRepository.existsByNameIgnoreCase(request.name())) {
            throw ApiException.conflict("PROJECT_NAME_EXISTS",
                    "A project with this name already exists.");
        }
        Project project = projectRepository.save(new Project(
                request.name(), request.description(), request.environmentName(), null));
        audit.record(actor, "PROJECT_CREATED", "PROJECT", String.valueOf(project.getId()),
                java.util.Map.of("name", project.getName()));
        return toDetail(project);
    }

    @Transactional
    public ProjectResponse update(Long id, ProjectUpdateRequest request, String actor) {
        Project project = requireActiveProject(id);

        if (request.name() != null && !request.name().equalsIgnoreCase(project.getName())) {
            if (projectRepository.existsByNameIgnoreCase(request.name())) {
                throw ApiException.conflict("PROJECT_NAME_EXISTS",
                        "A project with this name already exists.");
            }
            project.setName(request.name());
        }
        if (request.description() != null) {
            project.setDescription(request.description());
        }
        if (request.environmentName() != null) {
            project.setEnvironmentName(request.environmentName());
        }
        if (request.active() != null) {
            project.setActive(request.active());
        }
        projectRepository.save(project);
        audit.record(actor, "PROJECT_UPDATED", "PROJECT", String.valueOf(project.getId()), null);
        return toDetail(project);
    }

    /** Soft delete — history (executions, events, artifacts) is preserved. */
    @Transactional
    public void deactivate(Long id, String actor) {
        Project project = requireActiveProject(id);
        project.setActive(false);
        projectRepository.save(project);
        audit.record(actor, "PROJECT_DEACTIVATED", "PROJECT", String.valueOf(project.getId()), null);
    }

    private Project requireActiveProject(Long id) {
        return projectRepository.findByIdAndActiveTrue(id)
                .orElseThrow(() -> ApiException.notFound("PROJECT_NOT_FOUND",
                        "Project %d does not exist or is not active.".formatted(id)));
    }

    private ProjectResponse toDetail(Project project) {
        return new ProjectResponse(
                project.getId(),
                project.getName(),
                project.getDescription(),
                project.getEnvironmentName(),
                project.isActive(),
                project.getCreatedAt(),
                environmentRepository.countByProjectId(project.getId()),
                screenRepository.countByProjectId(project.getId()),
                executionRepository.countByProjectId(project.getId()),
                environmentRepository.findByProjectIdOrderByAppTypeAsc(project.getId()).stream()
                        .map(EnvironmentResponse::from)
                        .toList(),
                screenRepository.findByProjectIdOrderByScreenCodeAsc(project.getId()).stream()
                        .map(ScreenResponse::from)
                        .toList());
    }
}
