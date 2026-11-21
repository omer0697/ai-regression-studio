package com.ars.api;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * End-to-end Phase 1 scenario against a real PostgreSQL:
 * login (with CSRF), project/environment/screen configuration, execution
 * start and the honest NOT_SUPPORTED outcome recorded without a worker.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
@Tag("integration")
class ArsApiApplicationIT {

    private static final String SEED_USERNAME = "admin";
    private static final String SEED_PASSWORD = "it-admin-pass-123";

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:17-alpine");

    @DynamicPropertySource
    static void registerProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
        registry.add("app.seed.admin-username", () -> SEED_USERNAME);
        registry.add("app.seed.admin-password", () -> SEED_PASSWORD);
        registry.add("app.worker.base-url", () -> "");
    }

    @Autowired
    private TestRestTemplate rest;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Map<String, String> cookies = new HashMap<>();

    @Test
    void phase1ConfigurationAndExecutionFlow() throws Exception {
        // 1. Health is public.
        ResponseEntity<String> health = exchange(HttpMethod.GET, "/actuator/health", null, null);
        assertThat(health.getStatusCode().value()).isEqualTo(200);
        assertThat(health.getBody()).contains("\"UP\"");

        // 2. Anonymous session probe sets the CSRF cookie.
        ResponseEntity<String> me = exchange(HttpMethod.GET, "/api/auth/me", null, null);
        assertThat(me.getStatusCode().value()).isEqualTo(200);
        assertThat(objectMapper.readTree(me.getBody()).path("user").isNull()).isTrue();
        assertThat(cookies).containsKey("XSRF-TOKEN");

        // 3. Login without the CSRF header is rejected.
        ResponseEntity<String> csrflessLogin = exchange(HttpMethod.POST, "/api/auth/login",
                Map.of("username", SEED_USERNAME, "password", SEED_PASSWORD), "__skip_csrf__");
        assertThat(csrflessLogin.getStatusCode().value()).isEqualTo(403);

        // 4. Wrong credentials are rejected with a machine-readable code.
        ResponseEntity<String> badLogin = exchange(HttpMethod.POST, "/api/auth/login",
                Map.of("username", SEED_USERNAME, "password", "wrong"), null);
        assertThat(badLogin.getStatusCode().value()).isEqualTo(401);
        assertThat(objectMapper.readTree(badLogin.getBody()).path("code").asText())
                .isEqualTo("INVALID_CREDENTIALS");

        // 5. Valid login establishes the session.
        ResponseEntity<String> login = exchange(HttpMethod.POST, "/api/auth/login",
                Map.of("username", SEED_USERNAME, "password", SEED_PASSWORD), null);
        assertThat(login.getStatusCode().value()).isEqualTo(200);
        assertThat(cookies).containsKey("JSESSIONID");

        // 6. Authenticated session reflects the seeded admin user.
        ResponseEntity<String> meAfter = exchange(HttpMethod.GET, "/api/auth/me", null, null);
        JsonNode user = objectMapper.readTree(meAfter.getBody()).path("user");
        assertThat(user.path("username").asText()).isEqualTo(SEED_USERNAME);
        assertThat(user.path("role").asText()).isEqualTo("ADMIN");

        // 7. Create the migration project.
        ResponseEntity<String> project = exchange(HttpMethod.POST, "/api/projects",
                Map.of("name", "KAP Migration", "description", "KAP GWT→React",
                        "environmentName", "TEST"), null);
        assertThat(project.getStatusCode().value()).isEqualTo(201);
        JsonNode projectBody = objectMapper.readTree(project.getBody());
        long projectId = projectBody.path("id").asLong();

        // 8. Configure both application environments.
        ResponseEntity<String> gwtEnv = exchange(HttpMethod.POST,
                "/api/projects/%d/environments".formatted(projectId),
                Map.of(
                        "appType", "LEGACY_GWT",
                        "displayName", "KAP GWT (TEST)",
                        "baseUrl", "https://gwt.kap-test.example.com",
                        "environmentLabel", "TEST",
                        "authMethod", "NONE",
                        "allowedDomains", List.of("gwt.kap-test.example.com")),
                null);
        assertThat(gwtEnv.getStatusCode().value()).isEqualTo(201);

        ResponseEntity<String> reactEnv = exchange(HttpMethod.POST,
                "/api/projects/%d/environments".formatted(projectId),
                Map.of(
                        "appType", "REACT",
                        "displayName", "KAP React (TEST)",
                        "baseUrl", "https://react.kap-test.example.com",
                        "environmentLabel", "TEST",
                        "authMethod", "NONE",
                        "allowedDomains", List.of("react.kap-test.example.com")),
                null);
        assertThat(reactEnv.getStatusCode().value()).isEqualTo(201);

        // Duplicate environment for the same app type is rejected.
        ResponseEntity<String> duplicateEnv = exchange(HttpMethod.POST,
                "/api/projects/%d/environments".formatted(projectId),
                Map.of(
                        "appType", "LEGACY_GWT",
                        "displayName", "duplicate",
                        "baseUrl", "https://gwt2.kap-test.example.com",
                        "environmentLabel", "TEST",
                        "authMethod", "NONE"),
                null);
        assertThat(duplicateEnv.getStatusCode().value()).isEqualTo(409);

        // 9. Register the KPY68 screen.
        ResponseEntity<String> screen = exchange(HttpMethod.POST,
                "/api/projects/%d/screens".formatted(projectId),
                Map.of("screenCode", "KPY68", "name", "Parametre Tanımları",
                        "legacyRoute", "#KPY68", "reactRoute", "/kpy68"),
                null);
        assertThat(screen.getStatusCode().value()).isEqualTo(201);
        long screenId = objectMapper.readTree(screen.getBody()).path("id").asLong();

        // 10. Start an execution; with no worker configured it must end
        // honestly as NOT_SUPPORTED (never a fake pass).
        ResponseEntity<String> execution = exchange(HttpMethod.POST,
                "/api/projects/%d/executions".formatted(projectId),
                Map.of("screenId", screenId, "mode", "DISCOVERY"), null);
        assertThat(execution.getStatusCode().value()).isEqualTo(201);
        JsonNode executionBody = objectMapper.readTree(execution.getBody());
        long executionId = executionBody.path("id").asLong();
        assertThat(executionBody.path("status").asText()).isEqualTo("NOT_SUPPORTED");
        assertThat(executionBody.path("errorCode").asText()).isEqualTo("WORKER_NOT_CONFIGURED");

        // 11. Execution detail persists the same status.
        ResponseEntity<String> executionDetail = exchange(HttpMethod.GET,
                "/api/executions/%d".formatted(executionId), null, null);
        assertThat(objectMapper.readTree(executionDetail.getBody()).path("status").asText())
                .isEqualTo("NOT_SUPPORTED");

        // 12. Recorded events document the honest outcome.
        ResponseEntity<String> events = exchange(HttpMethod.GET,
                "/api/executions/%d/events?from=0".formatted(executionId), null, null);
        JsonNode eventItems = objectMapper.readTree(events.getBody()).path("items");
        assertThat(eventItems.size()).isGreaterThan(0);
        boolean documentsWorkerError = eventItems.toString().contains("WORKER_NOT_CONFIGURED");
        assertThat(documentsWorkerError).isTrue();

        // 13. Anonymous users cannot read projects.
        HttpHeaders anonymousHeaders = new HttpHeaders();
        anonymousHeaders.setAccept(List.of(MediaType.APPLICATION_JSON));
        ResponseEntity<String> anonymous = rest.getRestTemplate().exchange(
                "/api/projects", HttpMethod.GET, new HttpEntity<>(anonymousHeaders), String.class);
        assertThat(anonymous.getStatusCode().value()).isEqualTo(401);
        assertThat(objectMapper.readTree(anonymous.getBody()).path("code").asText())
                .isEqualTo("UNAUTHENTICATED");
    }

    // ------------------------------------------------------------------
    // Minimal cookie/CSRF-aware exchange helpers.
    // ------------------------------------------------------------------

    private HttpHeaders headers(String csrfOverride) {
        HttpHeaders httpHeaders = new HttpHeaders();
        httpHeaders.setContentType(MediaType.APPLICATION_JSON);
        httpHeaders.setAccept(List.of(MediaType.APPLICATION_JSON));
        if (!cookies.isEmpty()) {
            StringBuilder cookieHeader = new StringBuilder();
            cookies.forEach((name, value) -> {
                if (!cookieHeader.isEmpty()) {
                    cookieHeader.append("; ");
                }
                cookieHeader.append(name).append("=").append(value);
            });
            httpHeaders.set(HttpHeaders.COOKIE, cookieHeader.toString());
        }
        String csrf = csrfOverride == null ? cookies.get("XSRF-TOKEN") : csrfOverride;
        if (csrf != null && !"__skip_csrf__".equals(csrf)) {
            httpHeaders.set("X-XSRF-TOKEN", csrf);
        } else if (csrf == null && cookies.containsKey("XSRF-TOKEN")) {
            httpHeaders.set("X-XSRF-TOKEN", cookies.get("XSRF-TOKEN"));
        }
        return httpHeaders;
    }

    private ResponseEntity<String> exchange(HttpMethod method, String path, Object body,
            String csrfOverride) {
        HttpHeaders httpHeaders = headers(csrfOverride);
        HttpEntity<Object> entity = new HttpEntity<>(body, httpHeaders);
        ResponseEntity<String> response = rest.getRestTemplate()
                .exchange(path, method, entity, String.class);
        List<String> setCookies = response.getHeaders().get(HttpHeaders.SET_COOKIE);
        if (setCookies != null) {
            setCookies.forEach(this::captureCookie);
        }
        return response;
    }

    private void captureCookie(String setCookie) {
        int equalsIndex = setCookie.indexOf('=');
        if (equalsIndex <= 0) {
            return;
        }
        String name = setCookie.substring(0, equalsIndex);
        String value = setCookie.substring(equalsIndex + 1);
        int semicolon = value.indexOf(';');
        if (semicolon >= 0) {
            value = value.substring(0, semicolon);
        }
        cookies.put(name, value);
    }
}
