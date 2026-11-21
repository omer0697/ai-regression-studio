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
        Ai ai,
        Confluence confluence) {

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

    /**
     * Evidence artifact storage.
     *
     * <p>Two modes: {@code s3} (MinIO/S3-compatible, for shared deployments)
     * and {@code filesystem} (a plain directory, for no-Docker local runs).
     * The SQLite profile defaults to {@code filesystem}.</p>
     */
    public record Storage(
            String mode,
            String endpoint,
            String accessKey,
            String secretKey,
            String bucket,
            String dir) {
        public boolean filesystemMode() {
            return "filesystem".equalsIgnoreCase(mode == null ? "" : mode.trim());
        }

        /** S3/MinIO client is only built when the endpoint is configured. */
        public boolean enabled() {
            return !filesystemMode() && endpoint != null && !endpoint.isBlank();
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

    /** Company Confluence (requirement source). Optional by design. */
    public record Confluence(String baseUrl, String token) {
        public boolean enabled() {
            return baseUrl != null && !baseUrl.isBlank()
                    && token != null && !token.isBlank();
        }
    }
}
