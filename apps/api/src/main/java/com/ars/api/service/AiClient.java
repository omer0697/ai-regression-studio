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

import com.ars.api.config.AppProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * OpenAI-compatible chat-completions adapter for the company-hosted DeepSeek
 * endpoint. Vision is never assumed: prompts contain sanitized DOM/element
 * snapshots only. When AI is not configured the caller receives an honest
 * {@link AiUnavailableException} — output is never fabricated.
 */
@Service
public class AiClient {

    private static final Logger log = LoggerFactory.getLogger(AiClient.class);

    private final AppProperties properties;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    public AiClient(AppProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        if (properties.ai().enabled()) {
            var httpClient = java.net.http.HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(5))
                    .build();
            var requestFactory = new JdkClientHttpRequestFactory(httpClient);
            this.restClient = RestClient.builder()
                    .baseUrl(properties.ai().baseUrl())
                    .requestFactory(requestFactory)
                    .defaultHeader("Authorization", "Bearer " + properties.ai().apiKey())
                    .defaultHeader("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                    .build();
        } else {
            this.restClient = null;
        }
    }

    public boolean enabled() {
        return restClient != null;
    }

    /** Completes a chat with a system and a user prompt; returns the content. */
    public String complete(String systemPrompt, String userPrompt) throws AiUnavailableException {
        if (!enabled()) {
            throw new AiUnavailableException("AI provider is not configured.");
        }
        int timeoutSeconds = properties.ai().timeoutSeconds() == null
                ? 60
                : properties.ai().timeoutSeconds();
        int maxTokens = properties.ai().maxOutputTokens() == null
                ? 2048
                : properties.ai().maxOutputTokens();

        Map<String, Object> body = Map.of(
                "model", properties.ai().model(),
                "temperature", 0,
                "max_tokens", maxTokens,
                "messages", List.of(
                        Map.of("role", "system", "content", systemPrompt),
                        Map.of("role", "user", "content", userPrompt)));

        try {
            String response = restClient.post()
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

    /** Raised when AI is unconfigured, unreachable or returns nothing usable. */
    public static class AiUnavailableException extends Exception {

        public AiUnavailableException(String message) {
            super(message);
        }
    }
}
