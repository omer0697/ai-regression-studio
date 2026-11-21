package com.ars.api.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ars.api.dto.ProjectCreateRequest;
import com.ars.api.dto.ProjectResponse;
import com.ars.api.dto.ProjectSummaryResponse;
import com.ars.api.dto.ProjectUpdateRequest;
import com.ars.api.service.ProjectService;

import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api")
@Tag(name = "Projects", description = "Test project management.")
public class ProjectController {

    private final ProjectService projectService;

    public ProjectController(ProjectService projectService) {
        this.projectService = projectService;
    }

    @GetMapping("/projects")
    public List<ProjectSummaryResponse> list() {
        return projectService.list();
    }

    @GetMapping("/projects/{id}")
    public ProjectResponse get(@PathVariable Long id) {
        return projectService.get(id);
    }

    @PostMapping("/projects")
    @PreAuthorize("hasAnyRole('ADMIN','TESTER')")
    public ResponseEntity<ProjectResponse> create(
            @Valid @RequestBody ProjectCreateRequest request, Authentication authentication) {
        ProjectResponse response = projectService.create(request, actor(authentication));
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PutMapping("/projects/{id}")
    @PreAuthorize("hasAnyRole('ADMIN','TESTER')")
    public ProjectResponse update(
            @PathVariable Long id,
            @Valid @RequestBody ProjectUpdateRequest request,
            Authentication authentication) {
        return projectService.update(id, request, actor(authentication));
    }

    @DeleteMapping("/projects/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deactivate(@PathVariable Long id, Authentication authentication) {
        projectService.deactivate(id, actor(authentication));
        return ResponseEntity.noContent().build();
    }

    static String actor(Authentication authentication) {
        if (authentication != null && authentication.getPrincipal() instanceof UserDetails details) {
            return details.getUsername();
        }
        return authentication == null ? null : authentication.getName();
    }
}
