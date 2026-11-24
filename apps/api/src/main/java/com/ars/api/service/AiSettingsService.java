package com.ars.api.service;

import java.time.Instant;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ars.api.config.AppProperties;
import com.ars.api.domain.entity.AiProviderSetting;
import com.ars.api.domain.repository.AiProviderSettingRepository;
import com.ars.api.web.ApiException;

/**
 * Resolves the effective AI provider configuration.
 *
 * <p>Precedence: the single UI-managed row ({@code ai_provider_setting},
 * written from the AI Ayarları screen) overrides the {@code AI_*}
 * environment variables when it exists. Neither source is ever fabricated:
 * unconfigured means unconfigured.</p>
 */
@Service
public class AiSettingsService {

    public static final int DEFAULT_TIMEOUT_SECONDS = 60;
    public static final int DEFAULT_MAX_OUTPUT_TOKENS = 2048;

    private final AppProperties properties;
    private final AiProviderSettingRepository repository;

    public AiSettingsService(AppProperties properties, AiProviderSettingRepository repository) {
        this.properties = properties;
        this.repository = repository;
    }

    /**
     * The resolved provider configuration. {@code source} reports where the
     * values came from: DATABASE (UI-managed) or ENV (environment variables).
     */
    public record EffectiveAiConfig(
            boolean configured,
            String source,
            String baseUrl,
            String model,
            String apiKey,
            Integer timeoutSeconds,
            Integer maxOutputTokens) {
    }

    @Transactional(readOnly = true)
    public EffectiveAiConfig effective() {
        AiProviderSetting row = repository.findById(AiProviderSetting.SINGLETON_ID).orElse(null);
        if (row != null) {
            return new EffectiveAiConfig(
                    isConfigured(row.isEnabled(), row.getBaseUrl(), row.getModel(), row.getApiKey()),
                    "DATABASE",
                    row.getBaseUrl(),
                    row.getModel(),
                    row.getApiKey(),
                    row.getTimeoutSeconds() > 0 ? row.getTimeoutSeconds() : DEFAULT_TIMEOUT_SECONDS,
                    row.getMaxOutputTokens() > 0 ? row.getMaxOutputTokens() : DEFAULT_MAX_OUTPUT_TOKENS);
        }
        AppProperties.Ai env = properties.ai();
        return new EffectiveAiConfig(
                env.enabled(),
                "ENV",
                env.baseUrl(),
                env.model(),
                env.apiKey(),
                env.timeoutSeconds() == null ? DEFAULT_TIMEOUT_SECONDS : env.timeoutSeconds(),
                env.maxOutputTokens() == null ? DEFAULT_MAX_OUTPUT_TOKENS : env.maxOutputTokens());
    }

    /**
     * Creates or updates the UI-managed settings row.
     *
     * @param apiKey blank keeps the previously stored key (the UI never
     *               receives it back, so it can only re-type or keep it)
     */
    @Transactional
    public AiProviderSetting save(
            boolean enabled,
            String baseUrl,
            String model,
            String apiKey,
            Integer timeoutSeconds,
            Integer maxOutputTokens) {
        AiProviderSetting existing = repository.findById(AiProviderSetting.SINGLETON_ID).orElse(null);
        String resolvedKey = (apiKey != null && !apiKey.isBlank())
                ? apiKey.strip()
                : (existing != null && existing.getApiKey() != null && !existing.getApiKey().isBlank()
                        ? existing.getApiKey()
                        : "local-llm");
        AiProviderSetting targetRow = existing != null
                ? existing
                : new AiProviderSetting(baseUrl, model, resolvedKey);
        targetRow.setEnabled(enabled);
        targetRow.setBaseUrl(blankToNull(baseUrl));
        targetRow.setModel(blankToNull(model));
        targetRow.setApiKey(resolvedKey);
        targetRow.setTimeoutSeconds(timeoutSeconds == null || timeoutSeconds <= 0
                ? DEFAULT_TIMEOUT_SECONDS : timeoutSeconds);
        targetRow.setMaxOutputTokens(maxOutputTokens == null || maxOutputTokens <= 0
                ? DEFAULT_MAX_OUTPUT_TOKENS : maxOutputTokens);

        if (enabled && !isConfigured(true, targetRow.getBaseUrl(), targetRow.getModel(), targetRow.getApiKey())) {
            throw ApiException.badRequest("AI_CONFIG_INCOMPLETE",
                    "Enabling the AI provider requires a base URL and a model name.");
        }
        return repository.save(targetRow);
    }

    /** Optional maintenance: drops the UI-managed row back to env-only. */
    @Transactional
    public void delete() {
        repository.findById(AiProviderSetting.SINGLETON_ID)
                .ifPresent(repository::delete);
    }

    public Instant rowUpdatedAt() {
        return repository.findById(AiProviderSetting.SINGLETON_ID)
                .map(AiProviderSetting::getUpdatedAt)
                .orElse(null);
    }

    private static boolean isConfigured(boolean enabled, String baseUrl, String model, String apiKey) {
        return enabled
                && baseUrl != null && !baseUrl.isBlank()
                && model != null && !model.isBlank()
                && apiKey != null && !apiKey.isBlank();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }
}
