package com.ars.api.service;

import java.net.URI;
import java.time.Duration;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.ars.api.config.AppProperties;
import com.ars.api.dto.worker.WorkerDiscoverJobPayload;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * HTTP client for the browser worker.
 *
 * <p>Phase 1 contract: the worker skeleton answers POST /api/jobs with a
 * structured 501 (capability not implemented). This client maps every outcome
 * to an honest {@link DispatchOutcome} — it never fabricates acceptance.</p>
 */
@Component
public class WorkerClient {

    private static final Logger log = LoggerFactory.getLogger(WorkerClient.class);

    private final AppProperties properties;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    public WorkerClient(AppProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;

        if (properties.worker().enabled()) {
            var httpClient = java.net.http.HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(3))
                    .followRedirects(java.net.http.HttpClient.Redirect.NEVER)
                    .build();
            var requestFactory = new JdkClientHttpRequestFactory(httpClient);
            this.restClient = RestClient.builder()
                    .baseUrl(properties.worker().baseUrl())
                    .requestFactory(requestFactory)
                    .build();
        } else {
            this.restClient = null;
        }
    }

    public boolean isConfigured() {
        return restClient != null;
    }

    public WorkerHealth health() {
        if (!isConfigured()) {
            return new WorkerHealth(false, false, "WORKER_NOT_CONFIGURED", Map.of());
        }
        try {
            String body = restClient.get()
                    .uri("/api/health")
                    .accept(MediaType.APPLICATION_JSON)
                    .exchange((request, response) -> {
                        if (response.getStatusCode().is2xxSuccessful()) {
                            return StreamUtils.copyToString(response.getBody(), StandardCharsets.UTF_8);
                        }
                        return "";
                    }, true);
            JsonNode root = objectMapper.readTree(body);
            JsonNode capabilities = root.path("capabilities");
            Map<String, Boolean> parsed = new java.util.LinkedHashMap<>();
            java.util.Iterator<String> names = capabilities.fieldNames();
            while (names.hasNext()) {
                String name = names.next();
                parsed.put(name, capabilities.path(name).asBoolean());
            }
            return new WorkerHealth(true, true, "OK", java.util.Collections.unmodifiableMap(parsed));
        } catch (IOException | RestClientException exception) {
            return new WorkerHealth(true, false, "WORKER_UNAVAILABLE", Map.of());
        }
    }

    public record WorkerHealth(boolean configured, boolean reachable, String detail,
            Map<String, Boolean> capabilities) {
    }

    /**
     * Queues a discover job. Phase 2 will replace the 501 handling with a real
     * job queue and progress callbacks.
     */
    public DispatchOutcome dispatchDiscover(WorkerDiscoverJobPayload payload) {
        if (!isConfigured()) {
            return DispatchOutcome.notSupported("WORKER_NOT_CONFIGURED",
                    "Browser worker base URL is not configured (ARS_WORKER_BASE_URL).");
        }
        try {
            return restClient.post()
                    .uri("/api/jobs")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .exchange((request, response) -> {
                        String body = response.getStatusCode().is2xxSuccessful()
                                ? ""
                                : StreamUtils.copyToString(response.getBody(), StandardCharsets.UTF_8);
                        return classify(response.getStatusCode().value(), body);
                    }, true);
        } catch (RestClientException exception) {
            log.warn("Browser worker unreachable: {}", exception.getMessage());
            return DispatchOutcome.error("WORKER_UNAVAILABLE",
                    "Browser worker could not be reached at "
                            + properties.worker().baseUrl() + ".");
        }
    }

    private DispatchOutcome classify(int status, String body) {
        if (status >= 200 && status < 300) {
            return DispatchOutcome.queued();
        }
        if (status == 501) {
            return DispatchOutcome.notSupported("WORKER_CAPABILITY_NOT_IMPLEMENTED",
                    extractMessage(body));
        }
        return DispatchOutcome.error("WORKER_UNEXPECTED_RESPONSE",
                "Browser worker returned HTTP " + status + ".");
    }

    private String extractMessage(String body) {
        try {
            JsonNode message = objectMapper.readTree(body).path("error").path("message");
            if (!message.isMissingNode()) {
                return message.asText();
            }
        } catch (IOException ignored) {
            // fall through to raw body
        }
        return body.length() > 500 ? body.substring(0, 500) : body;
    }

    public enum OutcomeState {
        QUEUED,
        NOT_SUPPORTED,
        ERROR
    }

    public record DispatchOutcome(OutcomeState state, String errorCode, String detail) {

        static DispatchOutcome queued() {
            return new DispatchOutcome(OutcomeState.QUEUED, null, null);
        }

        static DispatchOutcome notSupported(String errorCode, String detail) {
            return new DispatchOutcome(OutcomeState.NOT_SUPPORTED, errorCode, detail);
        }

        static DispatchOutcome error(String errorCode, String detail) {
            return new DispatchOutcome(OutcomeState.ERROR, errorCode, detail);
        }
    }

    /** Queues a Phase 5 comparison job (both apps + plan). */
    public DispatchOutcome dispatchComparison(
            com.ars.api.dto.worker.WorkerComparisonJobPayload payload) {
        if (!isConfigured()) {
            return DispatchOutcome.notSupported("WORKER_NOT_CONFIGURED",
                    "Browser worker base URL is not configured (ARS_WORKER_BASE_URL).");
        }
        try {
            try {
                log.info("Comparison job payload: {}",
                        objectMapper.writeValueAsString(payload));
            } catch (com.fasterxml.jackson.core.JsonProcessingException debugEx) {
                log.warn("Could not log comparison payload: {}", debugEx.getMessage());
            }
            return restClient.post()
                    .uri("/api/jobs")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .exchange((request, response) -> {
                        String body = response.getStatusCode().is2xxSuccessful()
                                ? ""
                                : StreamUtils.copyToString(response.getBody(), StandardCharsets.UTF_8);
                        return classify(response.getStatusCode().value(), body);
                    }, true);
        } catch (RestClientException exception) {
            log.warn("Browser worker unreachable: {}", exception.getMessage());
            return DispatchOutcome.error("WORKER_UNAVAILABLE",
                    "Browser worker could not be reached at "
                            + properties.worker().baseUrl() + ".");
        }
    }
}
