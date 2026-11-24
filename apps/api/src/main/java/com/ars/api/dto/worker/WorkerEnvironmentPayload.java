package com.ars.api.dto.worker;

import java.util.List;

import com.ars.api.domain.enums.AppType;
import com.ars.api.domain.enums.AuthMethod;

/**
 * Environment reference sent to the browser worker inside a job payload.
 *
 * <p>SECURITY: contains configuration and selector metadata only — never a
 * password or token. The worker resolves the {@code credentialReference}
 * through the API when Phase 2 implements authentication.</p>
 */
public record WorkerEnvironmentPayload(
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
        int explorationMaxInteractions,
        int explorationMaxOptions,
        boolean screenshotEnabled) {

    public static WorkerEnvironmentPayload from(
            com.ars.api.domain.entity.ApplicationEnvironment env) {
        return from(env, null);
    }

    public static WorkerEnvironmentPayload from(
            com.ars.api.domain.entity.ApplicationEnvironment env,
            String screenRoute) {
        return new WorkerEnvironmentPayload(
                env.getProjectId(),
                env.getAppType(),
                env.getDisplayName(),
                resolveTargetUrl(env.getBaseUrl(), screenRoute),
                env.getEnvironmentLabel(),
                env.getAuthMethod(),
                env.getCredentialReference(),
                env.getLoginUrl(),
                env.getUsernameSelector(),
                env.getPasswordSelector(),
                env.getSubmitSelector(),
                List.copyOf(env.getAllowedDomains()),
                List.copyOf(env.getAllowedActions()),
                List.copyOf(env.getProhibitedActions()),
                env.getBrowserTimeoutMs(),
                env.getExplorationMaxInteractions(),
                env.getExplorationMaxOptions(),
                env.isScreenshotEnabled());
    }

    /**
     * Combines the environment's base URL with the screen's route/path when provided.
     */
    public static String resolveTargetUrl(String baseUrl, String screenRoute) {
        if (screenRoute == null || screenRoute.isBlank()) {
            return baseUrl;
        }
        String route = screenRoute.trim();
        if (route.startsWith("http://") || route.startsWith("https://")) {
            return route;
        }
        String cleanBase = baseUrl == null ? "" : baseUrl.trim();
        if (cleanBase.endsWith(route)) {
            return cleanBase;
        }
        if (route.startsWith("#") || route.startsWith("?")) {
            return cleanBase + route;
        }
        String baseWithoutTrailingSlash = cleanBase.replaceAll("/+$", "");
        if (route.startsWith("/")) {
            return baseWithoutTrailingSlash + route;
        }
        return baseWithoutTrailingSlash + "/" + route;
    }
}
