package com.ars.api.config;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Application-level configuration bound from the {@code app.*} properties.
 *
 * <p>Secrets are never stored in this application's database — the worker
 * base URL, seed credentials and CORS origins come from environment
 * variables only.</p>
 */
@ConfigurationProperties(prefix = "app")
public record AppProperties(Seed seed, Worker worker, Cors cors) {

    public record Seed(String adminUsername, String adminPassword) {
    }

    public record Worker(String baseUrl) {
        public boolean enabled() {
            return baseUrl != null && !baseUrl.isBlank();
        }
    }

    public record Cors(List<String> allowedOrigins) {
    }
}
