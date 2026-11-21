package com.ars.api.config;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Application-level configuration bound from the {@code app.*} properties.
 *
 * <p>Secrets are never stored in this application's database — worker base
 * URL, internal callback token, seed credentials, CORS patterns and storage
 * credentials come from environment variables only.</p>
 */
@ConfigurationProperties(prefix = "app")
public record AppProperties(
        Seed seed,
        Worker worker,
        Cors cors,
        Internal internal,
        Storage storage,
        Ai ai) {

    public record Seed(String adminUsername, String adminPassword) {
    }

    public record Worker(String baseUrl) {
        public boolean enabled() {
            return baseUrl != null && !baseUrl.isBlank();
        }
    }

    public record Cors(List<String> allowedOrigins) {
    }

    /** Shared secret guarding the /api/internal/** callback endpoints. */
    public record Internal(String token) {
        public boolean enabled() {
            return token != null && !token.isBlank();
        }
    }

    /** S3-compatible evidence storage (MinIO). */
    public record Storage(String endpoint, String accessKey, String secretKey, String bucket) {
        public boolean enabled() {
            return endpoint != null && !endpoint.isBlank();
        }
    }

    /**
     * OpenAI-compatible AI provider (company-hosted DeepSeek). Unconfigured by
     * default — the platform stays fully usable and AI features report
     * AI_NOT_CONFIGURED instead of fabricating output.
     */
    public record Ai(
            String baseUrl,
            String model,
            String apiKey,
            Integer timeoutSeconds,
            Integer maxOutputTokens) {
        public boolean enabled() {
            return baseUrl != null && !baseUrl.isBlank()
                    && apiKey != null && !apiKey.isBlank()
                    && model != null && !model.isBlank();
        }
    }
}
