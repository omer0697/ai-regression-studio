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

import com.ars.api.dto.ScreenRequest;
import com.ars.api.dto.ScreenResponse;
import com.ars.api.service.ScreenService;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/projects/{projectId}/screens")
@Tag(name = "Screens", description = "Target screen registry (e.g. KPY68).")
public class ScreenController {

    private final ScreenService screenService;

    public ScreenController(ScreenService screenService) {
        this.screenService = screenService;
    }

    @GetMapping
    public List<ScreenResponse> list(@PathVariable Long projectId) {
        return screenService.list(projectId);
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN','TESTER')")
    public ResponseEntity<ScreenResponse> create(
            @PathVariable Long projectId,
            @Valid @RequestBody ScreenRequest request,
            Authentication authentication) {
        ScreenResponse response =
                screenService.create(projectId, request, ProjectController.actor(authentication));
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/{screenId}")
    @PreAuthorize("hasAnyRole('ADMIN','TESTER')")
    public ScreenResponse update(
            @PathVariable Long projectId,
            @PathVariable Long screenId,
            @Valid @RequestBody ScreenRequest request,
            Authentication authentication) {
        return screenService.update(projectId, screenId, request, ProjectController.actor(authentication));
    }

    @DeleteMapping("/{screenId}")
    @PreAuthorize("hasAnyRole('ADMIN','TESTER')")
    public ResponseEntity<Void> delete(
            @PathVariable Long projectId,
            @PathVariable Long screenId,
            Authentication authentication) {
        screenService.delete(projectId, screenId, ProjectController.actor(authentication));
        return ResponseEntity.noContent().build();
    }
}
