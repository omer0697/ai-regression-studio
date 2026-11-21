package com.ars.api.controller;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.ars.api.domain.entity.BugFinding;
import com.ars.api.domain.entity.ElementMapping;
import com.ars.api.service.BugFindingService;
import com.ars.api.service.ElementMappingService;
import com.ars.api.web.ApiException;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

@RestController
@RequestMapping("/api")
@Tag(name = "Bug Reports", description = "Evidence-backed GWT/React differences (bug findings).")
public class BugFindingController {

    private final BugFindingService findingService;
    private final ElementMappingService mappingService;

    public BugFindingController(BugFindingService findingService,
            ElementMappingService mappingService) {
        this.findingService = findingService;
        this.mappingService = mappingService;
    }

    @GetMapping("/bugs")
    public List<Map<String, Object>> list(@RequestParam(required = false) String status) {
        return findingService.listByStatus(status).stream()
                .map(BugFindingController::payload)
                .toList();
    }

    @GetMapping("/executions/{id}/findings")
    public List<Map<String, Object>> listByExecution(@PathVariable Long id) {
        return findingService.listByExecution(id).stream()
                .map(BugFindingController::payload)
                .toList();
    }

    @GetMapping("/bugs/{id}")
    public Map<String, Object> get(@PathVariable Long id) {
        return payload(findingService.get(id));
    }

    public record StatusChangeRequest(
            @NotBlank(message = "Status is required.") String status) {
    }

    @PostMapping("/bugs/{id}/status")
    @PreAuthorize("hasAnyRole('ADMIN','TESTER')")
    public Map<String, Object> updateStatus(
            @PathVariable Long id,
            @Valid @RequestBody StatusChangeRequest request,
            Authentication authentication) {
        return payload(findingService.updateStatus(
                id, request.status(), ProjectController.actor(authentication)));
    }

    @GetMapping("/executions/{id}/mapping")
    public List<Map<String, Object>> mapping(@PathVariable Long id) {
        return mappingService.listByExecution(id).stream()
                .map(BugFindingController::mappingPayload)
                .toList();
    }

    private static Map<String, Object> payload(BugFinding finding) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", finding.getId());
        payload.put("bugCode", finding.getBugCode());
        payload.put("projectId", finding.getProjectId());
        payload.put("executionId", finding.getExecutionId());
        payload.put("screenCode", finding.getScreenCode());
        payload.put("category", finding.getCategory());
        payload.put("severity", finding.getSeverity());
        payload.put("title", finding.getTitle());
        payload.put("expectedBehavior", finding.getExpectedBehavior());
        payload.put("actualBehavior", finding.getActualBehavior());
        payload.put("reproduction", finding.getReproduction());
        payload.put("evidenceArtifacts", finding.getEvidenceArtifacts());
        payload.put("aiHypothesis", finding.getAiHypothesis());
        payload.put("status", finding.getStatus());
        payload.put("createdAt", finding.getCreatedAt());
        return payload;
    }

    private static Map<String, Object> mappingPayload(ElementMapping mapping) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", mapping.getId());
        payload.put("legacyRef", mapping.getLegacyRef());
        payload.put("legacyLabel", mapping.getLegacyLabel());
        payload.put("reactRef", mapping.getReactRef());
        payload.put("reactLabel", mapping.getReactLabel());
        payload.put("confidence", mapping.getConfidence());
        payload.put("method", mapping.getMethod());
        payload.put("needsReview", mapping.isNeedsReview());
        return payload;
    }
}
