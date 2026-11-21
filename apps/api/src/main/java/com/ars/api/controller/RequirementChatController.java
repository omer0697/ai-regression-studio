package com.ars.api.controller;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ars.api.domain.entity.ChatMessage;
import com.ars.api.domain.entity.RequirementDefinition;
import com.ars.api.service.ChatService;
import com.ars.api.service.RequirementService;
import com.ars.api.web.ApiException;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * V8 user-driven extension: Confluence requirements and the project chat.
 */
@RestController
@RequestMapping("/api")
@Tag(name = "Requirements & Chat", description = "Confluence requirement ingestion and the project chat.")
public class RequirementChatController {

    private final RequirementService requirementService;
    private final ChatService chatService;

    public RequirementChatController(
            RequirementService requirementService,
            ChatService chatService) {
        this.requirementService = requirementService;
        this.chatService = chatService;
    }

    // ------------------------------------------------------------------
    // Requirements
    // ------------------------------------------------------------------

    public record ImportBody(
            @NotBlank(message = "Confluence page id is required.")
            @Size(max = 120)
            String confluencePageId) {
    }

    @PostMapping("/projects/{projectId}/screens/{screenCode}/requirements/import")
    public Map<String, Object> importRequirements(
            @PathVariable Long projectId,
            @PathVariable String screenCode,
            @Valid @RequestBody ImportBody body) {
        int imported = requirementService.importFromConfluence(
                projectId, screenCode, body.confluencePageId());
        return Map.of("imported", imported);
    }

    public record ManualRequirementBody(
            @NotBlank(message = "Title is required.")
            @Size(max = 300)
            String title,
            @Size(max = 4000)
            String content) {
    }

    @PostMapping("/projects/{projectId}/screens/{screenCode}/requirements")
    public Map<String, Object> addManual(
            @PathVariable Long projectId,
            @PathVariable String screenCode,
            @Valid @RequestBody ManualRequirementBody body) {
        RequirementDefinition requirement = requirementService.addManual(
                projectId, screenCode, body.title(), body.content());
        return payload(requirement);
    }

    @PostMapping("/projects/{projectId}/screens/{screenCode}/requirements/analyze")
    public Map<String, Object> analyze(
            @PathVariable Long projectId,
            @PathVariable String screenCode) {
        int analyzed = requirementService.analyzeCoverage(projectId, screenCode);
        return Map.of("analyzed", analyzed);
    }

    @GetMapping("/projects/{projectId}/screens/{screenCode}/requirements")
    public List<Map<String, Object>> list(
            @PathVariable Long projectId,
            @PathVariable String screenCode) {
        return requirementService.list(projectId, screenCode).stream()
                .map(RequirementChatController::payload)
                .toList();
    }

    // ------------------------------------------------------------------
    // Chat
    // ------------------------------------------------------------------

    public record ChatBody(
            @NotBlank(message = "Message is required.")
            @Size(max = 4000)
            String message) {
    }

    @PostMapping("/projects/{projectId}/chat")
    public Map<String, Object> send(
            @PathVariable Long projectId,
            @Valid @RequestBody ChatBody body) {
        ChatMessage reply = chatService.send(projectId, body.message());
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", reply.getId());
        payload.put("role", reply.getRole());
        payload.put("content", reply.getContent());
        payload.put("createdAt", reply.getCreatedAt());
        return payload;
    }

    @GetMapping("/projects/{projectId}/chat")
    public ResponseEntity<List<Map<String, Object>>> history(@PathVariable Long projectId) {
        List<Map<String, Object>> items = chatService.history(projectId).stream()
                .map(message -> {
                    Map<String, Object> payload = new LinkedHashMap<>();
                    payload.put("id", message.getId());
                    payload.put("role", message.getRole());
                    payload.put("content", message.getContent());
                    payload.put("createdAt", message.getCreatedAt());
                    return payload;
                })
                .toList();
        return ResponseEntity.ok(items);
    }

    private static Map<String, Object> payload(RequirementDefinition requirement) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", requirement.getId());
        payload.put("screenCode", requirement.getScreenCode());
        payload.put("title", requirement.getTitle());
        payload.put("content", requirement.getContent());
        payload.put("confluenceId", requirement.getConfluenceId());
        payload.put("sourceUrl", requirement.getSourceUrl());
        payload.put("status", requirement.getStatus());
        payload.put("coverage", requirement.getCoverage());
        payload.put("createdAt", requirement.getCreatedAt());
        return payload;
    }
}
