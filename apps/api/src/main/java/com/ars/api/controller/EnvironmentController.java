package com.ars.api.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ars.api.dto.EnvironmentRequest;
import com.ars.api.dto.EnvironmentResponse;
import com.ars.api.service.EnvironmentService;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/projects/{projectId}/environments")
@Tag(name = "Environments", description = "GWT/React application environment configuration.")
public class EnvironmentController {

    private final EnvironmentService environmentService;

    public EnvironmentController(EnvironmentService environmentService) {
        this.environmentService = environmentService;
    }

    @GetMapping
    public List<EnvironmentResponse> list(@PathVariable Long projectId) {
        return environmentService.list(projectId);
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','TESTER')")
    public ResponseEntity<EnvironmentResponse> create(
            @PathVariable Long projectId,
            @Valid @RequestBody EnvironmentRequest request,
            Authentication authentication) {
        EnvironmentResponse response =
                environmentService.create(projectId, request, ProjectController.actor(authentication));
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{environmentId}")
    @PreAuthorize("hasAnyRole('ADMIN','TESTER')")
    public EnvironmentResponse update(
            @PathVariable Long projectId,
            @PathVariable Long environmentId,
            @Valid @RequestBody EnvironmentRequest request,
            Authentication authentication) {
        return environmentService.update(
                projectId, environmentId, request, ProjectController.actor(authentication));
    }

    @DeleteMapping("/{environmentId}")
    @PreAuthorize("hasAnyRole('ADMIN','TESTER')")
    public ResponseEntity<Void> delete(
            @PathVariable Long projectId,
            @PathVariable Long environmentId,
            Authentication authentication) {
        environmentService.delete(projectId, environmentId, ProjectController.actor(authentication));
        return ResponseEntity.noContent().build();
    }
}
