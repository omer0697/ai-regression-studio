package com.ars.api.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ars.api.domain.entity.Artifact;
import com.ars.api.domain.entity.BugFinding;
import com.ars.api.domain.entity.TestExecution;
import com.ars.api.domain.repository.ArtifactRepository;
import com.ars.api.domain.repository.BugFindingRepository;
import com.ars.api.domain.repository.TestExecutionRepository;
import com.ars.api.dto.InternalDtos.BugFindingPayload;
import com.ars.api.web.ApiException;

/**
 * Persists evidence-backed findings from the differential engine and issues
 * stable bug codes (BUG-SCREEN-001). Findings are never marked resolved
 * automatically: confirmation and dismissal are human decisions.
 */
@Service
public class BugFindingService {

    private static final Set<String> CATEGORIES = Set.of(
            "FIELD_MISSING", "STATE_MISMATCH", "VALUE_MISMATCH", "DEPENDENCY_MISMATCH",
            "TABLE_MISMATCH");
    private static final Set<String> SEVERITIES = Set.of("HIGH", "MEDIUM", "LOW");

    private final BugFindingRepository repository;
    private final TestExecutionRepository executionRepository;
    private final com.ars.api.domain.repository.ScreenDefinitionRepository screenRepository;
    private final ArtifactRepository artifactRepository;

    public BugFindingService(
            BugFindingRepository repository,
            TestExecutionRepository executionRepository,
            com.ars.api.domain.repository.ScreenDefinitionRepository screenRepository,
            ArtifactRepository artifactRepository) {
        this.repository = repository;
        this.executionRepository = executionRepository;
        this.screenRepository = screenRepository;
        this.artifactRepository = artifactRepository;
    }

    @Transactional
    public int saveBatch(Long executionId, List<BugFindingPayload> items) {
        TestExecution execution = executionRepository.findById(executionId)
                .orElseThrow(() -> ApiException.notFound("EXECUTION_NOT_FOUND",
                        "Execution %d does not exist.".formatted(executionId)));

        var screen = screenRepository.findById(execution.getScreenId()).orElse(null);
        for (BugFindingPayload item : items) {
            validate(item);

            String screenCode = screen != null ? screen.getScreenCode() : "SCREEN";
            String bugCode = nextBugCode(screenCode);
            BugFinding finding = new BugFinding(
                    bugCode,
                    execution.getProjectId(),
                    execution.getId(),
                    screenCode,
                    item.category(),
                    item.severity(),
                    clip(item.title(), 200));
            finding.setExpectedBehavior(clip(item.expectedBehavior(), 1000));
            finding.setActualBehavior(clip(item.actualBehavior(), 1000));

            Map<String, Object> reproduction = new LinkedHashMap<>();
            reproduction.put("executionId", executionId);
            reproduction.put("legacyRef", item.legacyRef());
            reproduction.put("legacyLabel", item.legacyLabel());
            reproduction.put("reactRef", item.reactRef());
            reproduction.put("reactLabel", item.reactLabel());
            reproduction.put("attribute", item.attribute());
            finding.setReproduction(reproduction);
            finding.setEvidenceArtifacts(comparisonEvidenceArtifacts(executionId));
            repository.save(finding);
        }
        return items.size();
    }

    @Transactional(readOnly = true)
    public List<BugFinding> listByExecution(Long executionId) {
        return repository.findByExecutionIdOrderByIdAsc(executionId);
    }

    @Transactional(readOnly = true)
    public List<BugFinding> listAll() {
        return repository.findAllByOrderByCreatedAtDesc();
    }

    @Transactional(readOnly = true)
    public List<BugFinding> listByStatus(String status) {
        return repository.findAllByOrderByCreatedAtDesc().stream()
                .filter(finding -> status == null || finding.getStatus().equals(status))
                .toList();
    }

    @Transactional(readOnly = true)
    public BugFinding get(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("BUG_NOT_FOUND",
                        "Bug %d does not exist.".formatted(id)));
    }

    @Transactional
    public BugFinding updateStatus(Long id, String status, String actor) {
        BugFinding finding = get(id);
        if (!Set.of("CONFIRMED", "DISMISSED").contains(status)) {
            throw ApiException.badRequest("INVALID_STATUS",
                    "Status must be CONFIRMED or DISMISSED.");
        }
        finding.setStatus(status);
        return repository.save(finding);
    }

    /** Per-finding AI hypothesis — clearly separated from observed facts. */
    @Transactional
    public BugFinding setAiHypothesis(Long id, String hypothesis) {
        BugFinding finding = get(id);
        finding.setAiHypothesis(clip(hypothesis, 2000));
        return repository.save(finding);
    }

    private String nextBugCode(String screenCode) {
        long existing = repository.countByScreenCode(screenCode);
        return "BUG-%s-%03d".formatted(screenCode, existing + 1);
    }

    /** The comparison evidence set: per-app baseline and after-plan screenshots. */
    private List<String> comparisonEvidenceArtifacts(Long executionId) {
        List<String> names = new ArrayList<>();
        for (Artifact artifact : artifactRepository.findByExecutionIdOrderByIdAsc(executionId)) {
            if (artifact.getDisplayName().startsWith("comparison-")) {
                names.add(artifact.getDisplayName());
            }
        }
        return names;
    }

    private void validate(BugFindingPayload item) {
        if (!CATEGORIES.contains(item.category())) {
            throw ApiException.badRequest("INVALID_CATEGORY",
                    "Unknown finding category: %s".formatted(item.category()));
        }
        if (!SEVERITIES.contains(item.severity())) {
            throw ApiException.badRequest("INVALID_SEVERITY",
                    "Unknown severity: %s".formatted(item.severity()));
        }
        if (item.title() == null || item.title().isBlank()) {
            throw ApiException.badRequest("INVALID_TITLE", "Finding title is required.");
        }
    }

    private String clip(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() > max ? value.substring(0, max) : value;
    }
}
