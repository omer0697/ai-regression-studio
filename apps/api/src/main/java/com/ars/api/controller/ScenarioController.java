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

import com.ars.api.domain.entity.TestScenario;
import com.ars.api.service.ScenarioService;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api")
@Tag(name = "Scenarios", description = "Test scenario library with human approval.")
public class ScenarioController {

    private final ScenarioService scenarioService;

    public ScenarioController(ScenarioService scenarioService) {
        this.scenarioService = scenarioService;
    }

    @GetMapping("/scenarios")
    public List<Map<String, Object>> list(@RequestParam(required = false) Long projectId,
            @RequestParam(required = false) Long screenId) {
        List<TestScenario> scenarios = projectId != null
                ? scenarioService.listByProject(projectId)
                : screenId != null
                        ? scenarioService.listByScreen(screenId)
                        : scenarioService.listByProject(0L);
        return scenarios.stream().map(ScenarioController::payload).toList();
    }

    @GetMapping("/scenarios/{id}")
    public Map<String, Object> get(@PathVariable Long id) {
        return payload(scenarioService.get(id));
    }

    public record DecisionRequest(
            @Size(max = 500, message = "Reason must be at most 500 characters.")
            String reason) {
    }

    @PostMapping("/scenarios/{id}/approve")
    @PreAuthorize("hasAnyRole('ADMIN','TESTER')")
    public Map<String, Object> approve(@PathVariable Long id, Authentication authentication) {
        return payload(scenarioService.approve(id, ProjectController.actor(authentication)));
    }

    @PostMapping("/scenarios/{id}/reject")
    @PreAuthorize("hasAnyRole('ADMIN','TESTER')")
    public Map<String, Object> reject(
            @PathVariable Long id,
            @Valid @RequestBody(required = false) DecisionRequest request,
            Authentication authentication) {
        return payload(scenarioService.reject(
                id, ProjectController.actor(authentication), request == null ? null : request.reason()));
    }

    @GetMapping("/screens/{screenId}/approved-scenario")
    public ResponseEntity<Map<String, Object>> latestApproved(@PathVariable Long screenId) {
        return scenarioService.listByScreen(screenId).stream()
                .filter(scenario -> "APPROVED".equals(scenario.getStatus()))
                .findFirst()
                .map(scenario -> ResponseEntity.ok(payload(scenario)))
                .orElse(ResponseEntity.noContent().build());
    }

    private static Map<String, Object> payload(TestScenario scenario) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", scenario.getId());
        payload.put("projectId", scenario.getProjectId());
        payload.put("screenId", scenario.getScreenId());
        payload.put("name", scenario.getName());
        payload.put("description", scenario.getDescription());
        payload.put("source", scenario.getSource());
        payload.put("status", scenario.getStatus());
        payload.put("plan", scenario.getPlan());
        payload.put("proposedBy", scenario.getProposedBy());
        payload.put("approvedBy", scenario.getApprovedBy());
        payload.put("createdAt", scenario.getCreatedAt());
        payload.put("approvedAt", scenario.getApprovedAt());
        return payload;
    }
}
