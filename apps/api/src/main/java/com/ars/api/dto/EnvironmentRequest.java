package com.ars.api.dto;

import java.util.List;

import com.ars.api.domain.enums.AppType;
import com.ars.api.domain.enums.AuthMethod;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record EnvironmentRequest(
        @NotNull(message = "Application type is required.")
        AppType appType,

        @NotBlank(message = "Display name is required.")
        @Size(max = 80, message = "Display name must be at most 80 characters.")
        String displayName,

        @NotBlank(message = "Base URL is required.")
        @Size(max = 500, message = "Base URL must be at most 500 characters.")
        @Pattern(regexp = "^https?://\\S+$", message = "Base URL must be a valid http(s) URL.")
        String baseUrl,

        @NotBlank(message = "Environment label is required.")
        @Size(max = 40, message = "Environment label must be at most 40 characters.")
        String environmentLabel,

        @NotNull(message = "Authentication method is required.")
        AuthMethod authMethod,

        @Size(max = 120, message = "Credential reference must be at most 120 characters.")
        @Pattern(regexp = "^$|^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$",
                message = "Credential reference must be a reference name (letters, digits, '.', '_', '-'), never a secret value.")
        String credentialReference,

        @Size(max = 500, message = "Login URL must be at most 500 characters.")
        @Pattern(regexp = "^$|^https?://\\S+$", message = "Login URL must be a valid http(s) URL.")
        String loginUrl,

        @Size(max = 300, message = "Username selector must be at most 300 characters.")
        String usernameSelector,

        @Size(max = 300, message = "Password selector must be at most 300 characters.")
        String passwordSelector,

        @Size(max = 300, message = "Submit selector must be at most 300 characters.")
        String submitSelector,

        @Size(max = 20, message = "At most 20 allowed domains.")
        List<String> allowedDomains,

        @Size(max = 50, message = "At most 50 allowed actions.")
        List<String> allowedActions,

        @Size(max = 50, message = "At most 50 prohibited actions.")
        List<String> prohibitedActions,

        @Min(value = 1000, message = "Browser timeout must be at least 1000 ms.")
        @Max(value = 120000, message = "Browser timeout must be at most 120000 ms.")
        Integer browserTimeoutMs,

        Boolean screenshotEnabled) {
}
