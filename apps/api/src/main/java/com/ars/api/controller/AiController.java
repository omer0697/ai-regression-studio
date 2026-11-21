package com.ars.api.controller;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ars.api.domain.entity.TestScenario;
import com.ars.api.domain.repository.TestExecutionRepository;
import com.ars.api.service.AiAnalysisService;
import com.ars.api.service.AiClient;
import com.ars.api.service.AiPlanService;
import com.ars.api.service.AiSettingsService;
import com.ars.api.service.ScenarioPlanParser;
import com.ars.api.service.ScenarioService;
import com.ars.api.web.ApiException;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api")
@Tag(name = "AI", description = "AI provider status, planning and failure analysis.")
public class AiController {

    private final AiClient aiClient;
    private final AiSettingsService settingsService;
    private final AiPlanService planService;
    private final AiAnalysisService analysisService;
    private final ScenarioService scenarioService;
    private final TestExecutionRepository executionRepository;

    public AiController(
            AiClient aiClient,
            AiSettingsService settingsService,
            AiPlanService planService,
            AiAnalysisService analysisService,
            ScenarioService scenarioService,
            TestExecutionRepository executionRepository) {
        this.aiClient = aiClient;
        this.settingsService = settingsService;
        this.planService = planService;
        this.analysisService = analysisService;
        this.scenarioService = scenarioService;
        this.executionRepository = executionRepository;
    }

    /**
     * Configuration status — the API key itself is never exposed. Reports the
     * effective configuration: UI-managed row first, AI_* environment
     * variables as fallback (see {@code source}).
     */
    @GetMapping("/ai/status")
    public Map<String, Object> status() {
        AiSettingsService.EffectiveAiConfig config = settingsService.effective();
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("configured", config.configured());
        status.put("source", config.source());
        status.put("baseUrl", config.baseUrl());
        status.put("model", config.model());
        status.put("timeoutSeconds", config.timeoutSeconds());
        status.put("maxOutputTokens", config.maxOutputTokens());
        status.put("allowedActions", ScenarioPlanParser.SAFE_ACTIONS);
        status.put("apiKeyPresent", config.apiKey() != null && !config.apiKey().isBlank());
        return status;
    }

    public record NaturalLanguagePlanRequest(
            @NotBlank(message = "Command is required.")
            @Size(max = 2000, message = "Command must be at most 2000 characters.")
            String command) {
    }

    @PostMapping("/projects/{projectId}/screens/{screenId}/ai/plan")
    public Map<String, Object> proposePlan(
            @PathVariable Long projectId,
            @PathVariable Long screenId,
            @Valid @RequestBody NaturalLanguagePlanRequest request,
            org.springframework.security.core.Authentication authentication) {
        String actor = ProjectController.actor(authentication);
        TestScenario scenario = planService.proposePlan(
                projectId, screenId, request.command(), actor);
        return scenarioPayload(scenario);
    }

    @PostMapping("/executions/{id}/ai/analyze")
    public Map<String, Object> analyze(
            @PathVariable Long id,
            org.springframework.security.core.Authentication authentication) {
        executionRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("EXECUTION_NOT_FOUND",
                        "Execution %d does not exist.".formatted(id)));
        var analysis = analysisService.analyzeExecution(
                id, ProjectController.actor(authentication));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", analysis.getId());
        payload.put("kind", analysis.getKind());
        payload.put("model", analysis.getModel());
        payload.put("status", analysis.getStatus());
        payload.put("hypothesis", analysis.getSummary());
        payload.put("output", analysis.getOutputJson());
        payload.put("createdAt", analysis.getCreatedAt());
        return payload;
    }

    private static Map<String, Object> scenarioPayload(TestScenario scenario) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", scenario.getId());
        payload.put("projectId", scenario.getProjectId());
        payload.put("screenId", scenario.getScreenId());
        payload.put("name", scenario.getName());
        payload.put("description", scenario.getDescription());
        payload.put("source", scenario.getSource());
        payload.put("status", scenario.getStatus());
        payload.put("plan", scenario.getPlan());
        payload.put("createdAt", scenario.getCreatedAt());
        return payload;
    }
}
