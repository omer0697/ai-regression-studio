package com.ars.api.controller;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ars.api.service.AiClient;
import com.ars.api.service.AiSettingsService;
import com.ars.api.service.AuditService;
import com.ars.api.service.AiSettingsService.EffectiveAiConfig;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

/**
 * UI-managed AI provider settings (AI Ayarları screen).
 *
 * <p>The API key is write-only: it is accepted on save but never returned —
 * responses only report {@code apiKeyPresent}. Saving an empty key keeps the
 * previously stored one.</p>
 */
@RestController
@RequestMapping("/api/ai")
@Tag(name = "AI Settings", description = "UI-managed AI provider configuration.")
public class AiSettingsController {

    private final AiSettingsService settingsService;
    private final AiClient aiClient;
    private final AuditService audit;

    public AiSettingsController(AiSettingsService settingsService, AiClient aiClient, AuditService audit) {
        this.settingsService = settingsService;
        this.aiClient = aiClient;
        this.audit = audit;
    }

    public record SettingsUpdateRequest(
            Boolean enabled,
            @Size(max = 500, message = "Base URL must be at most 500 characters.")
            String baseUrl,
            @Size(max = 120, message = "Model must be at most 120 characters.")
            String model,
            @Size(max = 500, message = "API key must be at most 500 characters.")
            String apiKey,
            @Min(value = 1, message = "Timeout must be at least 1 second.")
            @Max(value = 600, message = "Timeout must be at most 600 seconds.")
            Integer timeoutSeconds,
            @Min(value = 64, message = "Max output tokens must be at least 64.")
            @Max(value = 32768, message = "Max output tokens must be at most 32768.")
            Integer maxOutputTokens) {
    }

    @GetMapping("/settings")
    public Map<String, Object> get() {
        EffectiveAiConfig config = settingsService.effective();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("source", config.source());
        payload.put("configured", config.configured());
        payload.put("enabled", config.configured());
        payload.put("baseUrl", config.baseUrl());
        payload.put("model", config.model());
        payload.put("timeoutSeconds", config.timeoutSeconds());
        payload.put("maxOutputTokens", config.maxOutputTokens());
        payload.put("apiKeyPresent", config.apiKey() != null && !config.apiKey().isBlank());
        payload.put("updatedAt", settingsService.rowUpdatedAt());
        return payload;
    }

    @PutMapping("/settings")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> update(
            @Valid @RequestBody SettingsUpdateRequest request,
            org.springframework.security.core.Authentication authentication) {
        settingsService.save(
                request.enabled() == null || request.enabled(),
                request.baseUrl(),
                request.model(),
                request.apiKey(),
                request.timeoutSeconds(),
                request.maxOutputTokens());
        // Audit: who changed the provider settings (the key is never logged).
        audit.record(ProjectController.actor(authentication), "AI_SETTINGS_UPDATED",
                "AI_PROVIDER_SETTING", "1", null);
        return get();
    }

    public record TestResult(boolean ok, String detail, String model) {
    }

    /** Honest connectivity probe against the current effective settings. */
    @PostMapping("/settings/test")
    @PreAuthorize("hasRole('ADMIN')")
    public TestResult test() {
        EffectiveAiConfig config = settingsService.effective();
        if (!config.configured()) {
            return new TestResult(false, "AI sağlayıcısı yapılandırılmadı — önce ayarları kaydedin.",
                    config.model());
        }
        try {
            String reply = aiClient.testConnection();
            return new TestResult(true, "Sağlayıcı yanıt verdi: %s".formatted(reply), config.model());
        } catch (AiClient.AiUnavailableException exception) {
            return new TestResult(false, exception.getMessage(), config.model());
        }
    }
}
