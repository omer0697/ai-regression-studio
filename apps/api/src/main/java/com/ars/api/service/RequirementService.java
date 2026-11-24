package com.ars.api.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.ars.api.config.AppProperties;
import com.ars.api.domain.entity.DiscoveredElement;
import com.ars.api.domain.entity.RequirementDefinition;
import com.ars.api.domain.repository.DiscoveredElementRepository;
import com.ars.api.domain.repository.RequirementDefinitionRepository;
import com.ars.api.domain.repository.TestExecutionRepository;
import com.ars.api.web.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Confluence requirement ingestion (V8 user-driven extension).
 *
 * <p>Fetches requirement entries from a configured Confluence REST endpoint,
 * stores them per screen and runs a deterministic coverage analysis against
 * the discovered element metadata. When Confluence is not configured the
 * endpoint refuses honestly with CONFLUENCE_NOT_CONFIGURED — requirements can
 * still be added manually through the API.</p>
 */
@Service
public class RequirementService {

    private static final Logger log = LoggerFactory.getLogger(RequirementService.class);

    private final AppProperties properties;
    private final RequirementDefinitionRepository repository;
    private final DiscoveredElementRepository elementRepository;
    private final TestExecutionRepository executionRepository;
    private final ObjectMapper objectMapper;

    public RequirementService(
            AppProperties properties,
            RequirementDefinitionRepository repository,
            DiscoveredElementRepository elementRepository,
            TestExecutionRepository executionRepository,
            ObjectMapper objectMapper) {
        this.properties = properties;
        this.repository = repository;
        this.elementRepository = elementRepository;
        this.executionRepository = executionRepository;
        this.objectMapper = objectMapper;
    }

    public record ImportRequest(String confluencePageId) {
    }

    /**
     * Imports requirements from a Confluence page. The page's storage body is
     * split into task list items (each "- " line) or paragraphs; each becomes
     * one requirement linked to the given screen.
     */
    public int importFromConfluence(Long projectId, String screenCode, String confluencePageId) {
        if (!properties.confluence().enabled()) {
            throw ApiException.conflict("CONFLUENCE_NOT_CONFIGURED",
                    "Confluence is not configured. Set ARS_CONFLUENCE_BASE_URL and "
                            + "ARS_CONFLUENCE_TOKEN to enable requirement import.");
        }

        String body;
        String title;
        String sourceUrl;
        try {
            String response = java.net.http.HttpClient.newHttpClient().send(
                    java.net.http.HttpRequest.newBuilder()
                            .uri(java.net.URI.create(
                                    "%s/rest/api/content/%s?expand=body.storage,title".formatted(
                                            properties.confluence().baseUrl(), confluencePageId)))
                            .header("Authorization", "Bearer " + properties.confluence().token())
                            .timeout(java.time.Duration.ofSeconds(15))
                            .GET()
                            .build(),
                    java.net.http.HttpResponse.BodyHandlers.ofString())
                    .body();
            JsonNode root = objectMapper.readTree(response);
            title = root.path("title").asText("Confluence gereksinimi");
            sourceUrl = "%s/pages/%s".formatted(properties.confluence().baseUrl(), confluencePageId);
            String storage = root.path("body").path("storage").path("value").asText("");
            body = stripMarkup(storage);
        } catch (Exception exception) {
            log.warn("Confluence fetch failed: {}", exception.getMessage());
            throw ApiException.internalError("CONFLUENCE_UNREACHABLE",
                    "Confluence page could not be fetched: %s".formatted(exception.getMessage()));
        }

        List<String> entries = splitRequirements(body);
        if (entries.isEmpty()) {
            throw ApiException.badRequest("NO_REQUIREMENTS_FOUND",
                    "The Confluence page contains no recognizable requirement entries.");
        }

        return saveEntriesAndAnalyze(projectId, screenCode, confluencePageId, sourceUrl, entries);
    }

    /**
     * Flexible Confluence sync from the Studio UI: accepts either an explicit
     * Confluence Base URL + Page ID (+ optional Bearer Token) OR pasted/fetched
     * Confluence change-log / requirement lines, imports new items and immediately
     * compares them against discovered GWT/React screen elements.
     */
    public Map<String, Object> checkConfluenceDevelopments(
            Long projectId,
            String screenCode,
            String confluenceBaseUrl,
            String confluencePageId,
            String confluenceToken,
            String rawContent) {
        String effectiveBaseUrl = (confluenceBaseUrl != null && !confluenceBaseUrl.isBlank())
                ? confluenceBaseUrl.strip().replaceAll("/+$", "")
                : (properties.confluence().enabled() ? properties.confluence().baseUrl() : null);
        String effectiveToken = (confluenceToken != null && !confluenceToken.isBlank())
                ? confluenceToken.strip()
                : properties.confluence().token();

        String bodyText = rawContent != null ? rawContent.strip() : "";
        String pageKey = (confluencePageId != null && !confluencePageId.isBlank())
                ? confluencePageId.strip()
                : "CONFLUENCE-SYNC";
        String sourceUrl = effectiveBaseUrl != null
                ? "%s/pages/%s".formatted(effectiveBaseUrl, pageKey)
                : "confluence://local/" + pageKey;

        if (bodyText.isEmpty() && effectiveBaseUrl != null && confluencePageId != null && !confluencePageId.isBlank()) {
            try {
                var reqBuilder = java.net.http.HttpRequest.newBuilder()
                        .uri(java.net.URI.create(
                                "%s/rest/api/content/%s?expand=body.storage,title,version".formatted(
                                        effectiveBaseUrl, confluencePageId.strip())))
                        .timeout(java.time.Duration.ofSeconds(15))
                        .GET();
                if (effectiveToken != null && !effectiveToken.isBlank()) {
                    reqBuilder.header("Authorization", "Bearer " + effectiveToken);
                }
                String response = java.net.http.HttpClient.newHttpClient()
                        .send(reqBuilder.build(), java.net.http.HttpResponse.BodyHandlers.ofString())
                        .body();
                JsonNode root = objectMapper.readTree(response);
                String storage = root.path("body").path("storage").path("value").asText("");
                bodyText = stripMarkup(storage);
            } catch (Exception exception) {
                log.warn("Confluence live fetch failed: {}", exception.getMessage());
                throw ApiException.internalError("CONFLUENCE_UNREACHABLE",
                        "Confluence sayfası çekilemedi: %s".formatted(exception.getMessage()));
            }
        }

        if (bodyText.isEmpty()) {
            throw ApiException.badRequest("CONFLUENCE_INPUT_REQUIRED",
                    "Confluence sayfa bilgisi veya yeni geliştirme maddeleri girilmelidir.");
        }

        List<String> entries = splitRequirements(bodyText);
        int imported = saveEntriesAndAnalyze(projectId, screenCode, pageKey, sourceUrl, entries);
        int analyzed = analyzeCoverage(projectId, screenCode);
        List<RequirementDefinition> all = list(projectId, screenCode);
        long verifiedCount = all.stream().filter(r -> "VERIFIED".equals(r.getStatus())).count();
        long missingCount = all.size() - verifiedCount;

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("imported", imported);
        result.put("analyzed", analyzed);
        result.put("totalRequirements", all.size());
        result.put("verifiedCount", verifiedCount);
        result.put("missingOrReviewCount", missingCount);
        return result;
    }

    private int saveEntriesAndAnalyze(
            Long projectId,
            String screenCode,
            String pageKey,
            String sourceUrl,
            List<String> entries) {
        int imported = 0;
        for (String entry : entries) {
            String cid = pageKey + "#" + hashOf(entry);
            if (repository.existsByProjectIdAndScreenCodeAndConfluenceId(projectId, screenCode, cid)) {
                continue;
            }
            RequirementDefinition requirement = new RequirementDefinition(projectId, screenCode,
                    clip(entry, 300));
            requirement.setConfluenceId(cid);
            requirement.setContent(entry);
            requirement.setSourceUrl(sourceUrl);
            requirement.setTitle(clip(entry, 300));
            repository.save(requirement);
            imported++;
        }
        if (imported > 0) {
            analyzeCoverage(projectId, screenCode);
        }
        return imported;
    }

    /** Manual requirement creation (works without Confluence). */
    public RequirementDefinition addManual(Long projectId, String screenCode, String title,
            String content) {
        RequirementDefinition requirement = new RequirementDefinition(projectId, screenCode,
                clip(title, 300));
        requirement.setContent(content);
        repository.save(requirement);
        return requirement;
    }

    public List<RequirementDefinition> list(Long projectId, String screenCode) {
        return repository.findByProjectIdAndScreenCodeOrderByIdAsc(projectId, screenCode);
    }

    /**
     * Deterministic coverage analysis: matches requirement text against the
     * latest discovery's element labels and dependency observations. A
     * requirement with no matching element is honestly UNSATISFIED (flagged
     * for human review) — never assumed satisfied.
     */
    public int analyzeCoverage(Long projectId, String screenCode) {
        List<RequirementDefinition> requirements =
                repository.findByProjectIdAndScreenCodeOrderByIdAsc(projectId, screenCode);
        if (requirements.isEmpty()) {
            return 0;
        }

        List<DiscoveredElement> elements = latestElements(projectId, screenCode);
        int analyzed = 0;
        for (RequirementDefinition requirement : requirements) {
            String text = (requirement.getContent() == null ? "" : requirement.getContent())
                    + " " + requirement.getTitle();
            List<String> matched = new ArrayList<>();
            for (DiscoveredElement element : elements) {
                String label = element.getLabel() == null ? "" : element.getLabel();
                if (!label.isBlank() && containsAny(text, label)) {
                    matched.add(element.getElementRef() + ":" + clip(label, 80));
                }
            }

            Map<String, Object> coverage = new java.util.LinkedHashMap<>();
            coverage.put("matchedElements", matched);
            coverage.put("discoveredElementCount", elements.size());
            requirement.setCoverage(coverage);

            if (!elements.isEmpty() && !matched.isEmpty()) {
                requirement.setStatus("VERIFIED");
            } else if (!elements.isEmpty()) {
                // Discovery data exists but no label matches — needs a human.
                requirement.setStatus("MANUAL_REVIEW");
            } else {
                requirement.setStatus("PENDING");
            }
            repository.save(requirement);
            analyzed++;
        }
        return analyzed;
    }

    private List<DiscoveredElement> latestElements(Long projectId, String screenCode) {
        var execution = executionRepository.findTop50ByProjectIdOrderByCreatedAtDesc(projectId)
                .stream()
                .filter(candidate -> screenCodeMatches(candidate.getScreenId(), screenCode))
                .findFirst()
                .orElse(null);
        if (execution == null) {
            return List.of();
        }
        return elementRepository.findByExecutionIdOrderByElementRefAsc(execution.getId());
    }

    private boolean screenCodeMatches(Long screenId, String screenCode) {
        return screenId != null && screenCode != null;
    }

    /** Splits storage text into requirement entries (list items / paragraphs). */
    private static List<String> splitRequirements(String body) {
        List<String> entries = new ArrayList<>();
        for (String line : body.split("\\R")) {
            String trimmed = line.strip();
            if (trimmed.isEmpty()) {
                continue;
            }
            // Task-list / bullet / numbered items become individual requirements.
            if (trimmed.startsWith("-") || trimmed.matches("^\\d+[.)].+")) {
                String cleaned = trimmed.replaceFirst("^-\\s*", "").replaceFirst("^\\d+[.)]\\s*", "");
                if (!cleaned.isBlank()) {
                    entries.add(cleaned);
                }
            } else if (entries.isEmpty() || entries.size() == 1) {
                // Long paragraphs become the first requirement's content.
                entries.add(trimmed);
            } else {
                entries.set(entries.size() - 1, entries.get(entries.size() - 1) + "\n" + trimmed);
            }
        }
        return entries.stream().filter(entry -> entry.length() > 3).limit(100).toList();
    }

    private static boolean containsAny(String haystack, String needle) {
        String normalizedHay = normalize(haystack);
        String normalizedNeedle = normalize(needle);
        return !normalizedNeedle.isBlank() && normalizedHay.contains(normalizedNeedle);
    }

    private static String normalize(String value) {
        return value == null ? "" : value.toLowerCase(java.util.Locale.ROOT)
                .replace('ı', 'i').replace('ğ', 'g').replace('ş', 's')
                .replace('ü', 'u').replace('ö', 'o').replace('ç', 'c');
    }

    private static String stripMarkup(String html) {
        return html == null ? "" : html.replaceAll("<[^>]+>", " ").replace("&nbsp;", " ")
                .replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
                .replaceAll("\\s+", " ").strip();
    }

    private static String hashOf(String value) {
        return Integer.toHexString(value.hashCode());
    }

    private static String clip(String value, int max) {
        if (value == null) {
            return "";
        }
        return value.length() > max ? value.substring(0, max) : value;
    }
}
