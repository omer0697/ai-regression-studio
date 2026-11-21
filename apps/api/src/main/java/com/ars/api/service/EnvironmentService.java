package com.ars.api.service;

import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ars.api.domain.entity.ApplicationEnvironment;
import com.ars.api.domain.repository.ApplicationEnvironmentRepository;
import com.ars.api.domain.repository.ProjectRepository;
import com.ars.api.dto.EnvironmentRequest;
import com.ars.api.dto.EnvironmentResponse;
import com.ars.api.web.ApiException;

@Service
public class EnvironmentService {

    private final ProjectRepository projectRepository;
    private final ApplicationEnvironmentRepository environmentRepository;
    private final AuditService audit;

    public EnvironmentService(
            ProjectRepository projectRepository,
            ApplicationEnvironmentRepository environmentRepository,
            AuditService audit) {
        this.projectRepository = projectRepository;
        this.environmentRepository = environmentRepository;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<EnvironmentResponse> list(Long projectId) {
        requireProject(projectId);
        return environmentRepository.findByProjectIdOrderByAppTypeAsc(projectId).stream()
                .map(EnvironmentResponse::from)
                .toList();
    }

    @Transactional
    public EnvironmentResponse create(Long projectId, EnvironmentRequest request, String actor) {
        requireProject(projectId);
        if (environmentRepository.existsByProjectIdAndAppType(projectId, request.appType())) {
            throw ApiException.conflict("ENVIRONMENT_ALREADY_EXISTS",
                    "An environment of type %s already exists for this project.".formatted(request.appType()));
        }
        if (request.authMethod() == com.ars.api.domain.enums.AuthMethod.TEST_ACCOUNT_FORM) {
            requireFormLoginFields(request);
        }

        ApplicationEnvironment environment = new ApplicationEnvironment(
                projectId, request.appType(), request.displayName(), request.baseUrl(),
                request.environmentLabel());
        applyRequest(environment, request);

        environment = environmentRepository.save(environment);
        audit.record(actor, "ENVIRONMENT_CREATED", "APPLICATION_ENVIRONMENT",
                String.valueOf(environment.getId()),
                java.util.Map.of("appType", request.appType().name()));
        return EnvironmentResponse.from(environment);
    }

    @Transactional
    public EnvironmentResponse update(Long projectId, Long environmentId, EnvironmentRequest request,
            String actor) {
        requireProject(projectId);
        ApplicationEnvironment environment = environmentRepository
                .findById(environmentId)
                .filter(env -> env.getProjectId().equals(projectId))
                .orElseThrow(() -> ApiException.notFound("ENVIRONMENT_NOT_FOUND",
                        "Environment %d does not belong to project %d.".formatted(environmentId, projectId)));

        if (request.authMethod() == com.ars.api.domain.enums.AuthMethod.TEST_ACCOUNT_FORM) {
            requireFormLoginFields(request);
        }
        applyRequest(environment, request);

        environment = environmentRepository.save(environment);
        audit.record(actor, "ENVIRONMENT_UPDATED", "APPLICATION_ENVIRONMENT",
                String.valueOf(environment.getId()), null);
        return EnvironmentResponse.from(environment);
    }

    @Transactional
    public void delete(Long projectId, Long environmentId, String actor) {
        requireProject(projectId);
        ApplicationEnvironment environment = environmentRepository
                .findById(environmentId)
                .filter(env -> env.getProjectId().equals(projectId))
                .orElseThrow(() -> ApiException.notFound("ENVIRONMENT_NOT_FOUND",
                        "Environment %d does not belong to project %d.".formatted(environmentId, projectId)));
        environmentRepository.delete(environment);
        audit.record(actor, "ENVIRONMENT_DELETED", "APPLICATION_ENVIRONMENT",
                String.valueOf(environmentId), null);
    }

    private void applyRequest(ApplicationEnvironment environment, EnvironmentRequest request) {
        environment.setDisplayName(request.displayName());
        environment.setBaseUrl(request.baseUrl());
        environment.setEnvironmentLabel(request.environmentLabel());
        environment.setAuthMethod(request.authMethod());
        environment.setCredentialReference(blankToNull(request.credentialReference()));
        environment.setLoginUrl(blankToNull(request.loginUrl()));
        environment.setUsernameSelector(blankToNull(request.usernameSelector()));
        environment.setPasswordSelector(blankToNull(request.passwordSelector()));
        environment.setSubmitSelector(blankToNull(request.submitSelector()));
        environment.setAllowedDomains(request.allowedDomains() == null
                ? List.of() : new ArrayList<>(request.allowedDomains()));
        environment.setAllowedActions(request.allowedActions() == null
                ? List.of("safe-exploration") : new ArrayList<>(request.allowedActions()));
        environment.setProhibitedActions(request.prohibitedActions() == null
                ? List.of("submit", "publish", "delete", "approve", "sign", "send")
                : new ArrayList<>(request.prohibitedActions()));
        environment.setBrowserTimeoutMs(
                request.browserTimeoutMs() == null ? 30_000 : request.browserTimeoutMs());
        environment.setScreenshotEnabled(
                request.screenshotEnabled() == null || request.screenshotEnabled());
    }

    private void requireFormLoginFields(EnvironmentRequest request) {
        if (isBlank(request.credentialReference()) || isBlank(request.loginUrl())
                || isBlank(request.usernameSelector()) || isBlank(request.passwordSelector())
                || isBlank(request.submitSelector())) {
            throw ApiException.badRequest("AUTH_METHOD_CONFIG_INCOMPLETE",
                    "TEST_ACCOUNT_FORM requires credentialReference, loginUrl and username/password/submit selectors.");
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private String blankToNull(String value) {
        return isBlank(value) ? null : value.trim();
    }

    private void requireProject(Long projectId) {
        projectRepository.findByIdAndActiveTrue(projectId)
                .orElseThrow(() -> ApiException.notFound("PROJECT_NOT_FOUND",
                        "Project %d does not exist or is not active.".formatted(projectId)));
    }
}
