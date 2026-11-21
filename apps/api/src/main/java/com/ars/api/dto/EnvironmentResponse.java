package com.ars.api.dto;

import java.time.Instant;
import java.util.List;

import com.ars.api.domain.entity.ApplicationEnvironment;
import com.ars.api.domain.enums.AppType;
import com.ars.api.domain.enums.AuthMethod;

public record EnvironmentResponse(
        Long id,
        Long projectId,
        AppType appType,
        String displayName,
        String baseUrl,
        String environmentLabel,
        AuthMethod authMethod,
        String credentialReference,
        String loginUrl,
        String usernameSelector,
        String passwordSelector,
        String submitSelector,
        List<String> allowedDomains,
        List<String> allowedActions,
        List<String> prohibitedActions,
        int browserTimeoutMs,
        boolean screenshotEnabled,
        Instant createdAt) {

    public static EnvironmentResponse from(ApplicationEnvironment entity) {
        return new EnvironmentResponse(
                entity.getId(),
                entity.getProjectId(),
                entity.getAppType(),
                entity.getDisplayName(),
                entity.getBaseUrl(),
                entity.getEnvironmentLabel(),
                entity.getAuthMethod(),
                entity.getCredentialReference(),
                entity.getLoginUrl(),
                entity.getUsernameSelector(),
                entity.getPasswordSelector(),
                entity.getSubmitSelector(),
                List.copyOf(entity.getAllowedDomains()),
                List.copyOf(entity.getAllowedActions()),
                List.copyOf(entity.getProhibitedActions()),
                entity.getBrowserTimeoutMs(),
                entity.isScreenshotEnabled(),
                entity.getCreatedAt());
    }
}
