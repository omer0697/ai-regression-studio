package com.ars.api.service;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * OpenAI-compatible chat-completions adapter for the company-hosted DeepSeek
 * endpoint. Vision is never assumed: prompts contain sanitized DOM/element
 * snapshots only. When AI is not configured the caller receives an honest
 * {@link AiUnavailableException} — output is never fabricated.
 *
 * <p>The configuration is resolved per call from {@link AiSettingsService}
 * (UI-managed row first, AI_* environment variables as fallback), so changes
 * made from the AI Ayarları screen take effect without a restart.</p>
 */
@Service
public class AiClient {

    private static final Logger log = LoggerFactory.getLogger(AiClient.class);

    private final AiSettingsService settings;
    private final ObjectMapper objectMapper;

    /** Cached per unique (baseUrl, apiKey) pair; rebuilt when settings change. */
    private volatile RestClient cachedClient;
    private volatile String cachedClientKey;

    public AiClient(AiSettingsService settings, ObjectMapper objectMapper) {
        this.settings = settings;
        this.objectMapper = objectMapper;
    }

    /** True when a usable configuration is present (UI row or environment). */
    public boolean enabled() {
        return settings.effective().configured();
    }

    /** Completes a chat with a system and a user prompt; returns the content. */
    public String complete(String systemPrompt, String userPrompt) throws AiUnavailableException {
        AiSettingsService.EffectiveAiConfig config = settings.effective();
        if (!config.configured()) {
            throw new AiUnavailableException("AI provider is not configured.");
        }

        Map<String, Object> body = Map.of(
                "model", config.model(),
                "temperature", 0,
                "max_tokens", config.maxOutputTokens(),
                "messages", List.of(
                        Map.of("role", "system", "content", systemPrompt),
                        Map.of("role", "user", "content", userPrompt)));

        try {
            String response = restClientFor(config)
                    .post()
                    .uri("/chat/completions")
                    .body(body)
                    .retrieve()
                    .body(String.class);
            JsonNode root = objectMapper.readTree(response == null ? "" : response);
            JsonNode content = root.path("choices").path(0).path("message").path("content");
            if (content.isMissingNode() || content.asText().isBlank()) {
                throw new AiUnavailableException("AI response contained no content.");
            }
            return content.asText();
        } catch (AiUnavailableException exception) {
            throw exception;
        } catch (Exception exception) {
            log.warn("AI call failed: {}", exception.getMessage());
            throw new AiUnavailableException(
                    "AI provider call failed: %s".formatted(exception.getMessage()));
        }
    }

    /**
     * Sends a minimal ping prompt against the current effective settings.
     * Returns the provider's reply; throws {@link AiUnavailableException}
     * with the concrete reason when the provider cannot be reached.
     */
    public String testConnection() throws AiUnavailableException {
        return complete(
                "You are a connectivity probe. Reply with the single word: OK.",
                "ping");
    }

    private RestClient restClientFor(AiSettingsService.EffectiveAiConfig config) {
        String key = "%s|%s|%s".formatted(config.baseUrl(), config.apiKey(), config.timeoutSeconds());
        RestClient current = cachedClient;
        if (current != null && key.equals(cachedClientKey)) {
            return current;
        }
        synchronized (this) {
            if (cachedClient == null || !key.equals(cachedClientKey)) {
                var httpClient = java.net.http.HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(5))
                        .build();
                var requestFactory = new JdkClientHttpRequestFactory(httpClient);
                requestFactory.setReadTimeout(Duration.ofSeconds(config.timeoutSeconds()));
                cachedClient = RestClient.builder()
                        .baseUrl(config.baseUrl())
                        .requestFactory(requestFactory)
                        .defaultHeader("Authorization", "Bearer " + config.apiKey())
                        .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                        .build();
                cachedClientKey = key;
            }
            return cachedClient;
        }
    }

    /** Raised when AI is unconfigured, unreachable or returns nothing usable. */
    public static class AiUnavailableException extends Exception {

        public AiUnavailableException(String message) {
            super(message);
        }
    }
}
