package com.ars.api.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ars.api.domain.entity.ScreenDefinition;
import com.ars.api.domain.repository.ProjectRepository;
import com.ars.api.domain.repository.ScreenDefinitionRepository;
import com.ars.api.dto.ScreenRequest;
import com.ars.api.dto.ScreenResponse;
import com.ars.api.web.ApiException;

@Service
public class ScreenService {

    private final ProjectRepository projectRepository;
    private final ScreenDefinitionRepository screenRepository;
    private final AuditService audit;

    public ScreenService(
            ProjectRepository projectRepository,
            ScreenDefinitionRepository screenRepository,
            AuditService audit) {
        this.projectRepository = projectRepository;
        this.screenRepository = screenRepository;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<ScreenResponse> list(Long projectId) {
        requireProject(projectId);
        return screenRepository.findByProjectIdOrderByScreenCodeAsc(projectId).stream()
                .map(ScreenResponse::from)
                .toList();
    }

    @Transactional
    public ScreenResponse create(Long projectId, ScreenRequest request, String actor) {
        requireProject(projectId);
        if (screenRepository.existsByProjectIdAndScreenCodeIgnoreCase(projectId, request.screenCode())) {
            throw ApiException.conflict("SCREEN_ALREADY_EXISTS",
                    "Screen code %s already exists in this project.".formatted(request.screenCode()));
        }

        ScreenDefinition screen = new ScreenDefinition(projectId, request.screenCode(), request.name());
        applyRequest(screen, request);
        screen = screenRepository.save(screen);

        audit.record(actor, "SCREEN_CREATED", "SCREEN_DEFINITION",
                String.valueOf(screen.getId()),
                java.util.Map.of("screenCode", screen.getScreenCode()));
        return ScreenResponse.from(screen);
    }

    @Transactional
    public ScreenResponse update(Long projectId, Long screenId, ScreenRequest request, String actor) {
        requireProject(projectId);
        ScreenDefinition screen = screenRepository.findByIdAndProjectId(screenId, projectId)
                .orElseThrow(() -> ApiException.notFound("SCREEN_NOT_FOUND",
                        "Screen %d does not belong to project %d.".formatted(screenId, projectId)));
        applyRequest(screen, request);
        screen = screenRepository.save(screen);

        audit.record(actor, "SCREEN_UPDATED", "SCREEN_DEFINITION",
                String.valueOf(screen.getId()), null);
        return ScreenResponse.from(screen);
    }

    @Transactional
    public void delete(Long projectId, Long screenId, String actor) {
        requireProject(projectId);
        ScreenDefinition screen = screenRepository.findByIdAndProjectId(screenId, projectId)
                .orElseThrow(() -> ApiException.notFound("SCREEN_NOT_FOUND",
                        "Screen %d does not belong to project %d.".formatted(screenId, projectId)));
        screenRepository.delete(screen);
        audit.record(actor, "SCREEN_DELETED", "SCREEN_DEFINITION",
                String.valueOf(screenId), null);
    }

    private void applyRequest(ScreenDefinition screen, ScreenRequest request) {
        screen.setName(request.name());
        screen.setLegacyRoute(blankToNull(request.legacyRoute()));
        screen.setReactRoute(blankToNull(request.reactRoute()));
        screen.setNavigationNotes(blankToNull(request.navigationNotes()));
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private void requireProject(Long projectId) {
        projectRepository.findByIdAndActiveTrue(projectId)
                .orElseThrow(() -> ApiException.notFound("PROJECT_NOT_FOUND",
                        "Project %d does not exist or is not active.".formatted(projectId)));
    }
}
