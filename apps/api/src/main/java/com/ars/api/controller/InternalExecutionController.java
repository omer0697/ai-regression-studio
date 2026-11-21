package com.ars.api.controller;

import java.io.IOException;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.ars.api.domain.entity.Artifact;
import com.ars.api.domain.enums.ExecutionEventType;
import com.ars.api.domain.repository.ArtifactRepository;
import com.ars.api.domain.repository.TestExecutionRepository;
import com.ars.api.dto.ArtifactResponseDto;
import com.ars.api.dto.ExecutionView;
import com.ars.api.dto.InternalDtos.InternalElementsRequest;
import com.ars.api.dto.InternalDtos.InternalEventRequest;
import com.ars.api.dto.InternalDtos.InternalStatusRequest;
import com.ars.api.service.ArtifactStorageService;
import com.ars.api.service.DiscoveredElementService;
import com.ars.api.service.ExecutionEventService;
import com.ars.api.service.ExecutionProgressService;
import com.ars.api.web.ApiException;

import io.swagger.v3.oas.annotations.Hidden;
import jakarta.validation.Valid;

/**
 * Worker -> API callback channel. Every endpoint is guarded by
 * {@link com.ars.api.security.InternalTokenFilter} (X-ARS-Internal-Token) —
 * these are not part of the user-facing API.
 */
@RestController
@RequestMapping("/api/internal/executions")
@Hidden
public class InternalExecutionController {

    private static final Set<String> ARTIFACT_TYPES =
            Set.of("SCREENSHOT", "TRACE", "CONSOLE_LOG", "NETWORK_LOG");
    private static final long MAX_ARTIFACT_BYTES = 25L * 1024 * 1024;

    private final TestExecutionRepository executionRepository;
    private final ExecutionEventService eventService;
    private final ExecutionProgressService progressService;
    private final DiscoveredElementService elementService;
    private final com.ars.api.service.DependencyObservationService observationService;
    private final ArtifactRepository artifactRepository;
    private final ArtifactStorageService storageService;

    public InternalExecutionController(
            TestExecutionRepository executionRepository,
            ExecutionEventService eventService,
            ExecutionProgressService progressService,
            DiscoveredElementService elementService,
            com.ars.api.service.DependencyObservationService observationService,
            ArtifactRepository artifactRepository,
            ArtifactStorageService storageService) {
        this.executionRepository = executionRepository;
        this.eventService = eventService;
        this.progressService = progressService;
        this.elementService = elementService;
        this.observationService = observationService;
        this.artifactRepository = artifactRepository;
        this.storageService = storageService;
    }

    @PostMapping("/{id}/events")
    public ResponseEntity<Void> appendEvent(
            @PathVariable Long id,
            @Valid @RequestBody InternalEventRequest request) {
        requireExecution(id);
        ExecutionEventType type = parseEventType(request.type());
        eventService.append(id, type, request.message(), request.payload());
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{id}/status")
    public ExecutionView updateStatus(
            @PathVariable Long id,
            @Valid @RequestBody InternalStatusRequest request) {
        requireExecution(id);
        return progressService.applyStatus(id, request);
    }

    @PostMapping("/{id}/elements")
    public ResponseEntity<Integer> saveElements(
            @PathVariable Long id,
            @Valid @RequestBody InternalElementsRequest request) {
        requireExecution(id);
        int saved = elementService.saveBatch(id, request.items());
        return ResponseEntity.ok(saved);
    }

    @PostMapping("/{id}/observations")
    public ResponseEntity<Integer> saveObservations(
            @PathVariable Long id,
            @Valid @RequestBody com.ars.api.dto.InternalDtos.InternalObservationsRequest request) {
        requireExecution(id);
        int saved = observationService.saveBatch(id, request.items());
        return ResponseEntity.ok(saved);
    }

    @PostMapping("/{id}/artifacts")
    public ResponseEntity<ArtifactResponseDto> uploadArtifact(
            @PathVariable Long id,
            @RequestParam("type") String type,
            @RequestParam("name") String name,
            jakarta.servlet.http.HttpServletRequest request) throws IOException {

        requireExecution(id);
        String artifactType = normalizeType(type);
        String displayName = sanitizeName(name);

        byte[] bytes = request.getInputStream().readAllBytes();
        if (bytes.length == 0) {
            throw ApiException.badRequest("EMPTY_ARTIFACT", "Artifact body is empty.");
        }
        if (bytes.length > MAX_ARTIFACT_BYTES) {
            throw ApiException.badRequest("ARTIFACT_TOO_LARGE",
                    "Artifacts larger than 25 MB are rejected.");
        }

        String contentType = request.getContentType() == null
                ? MediaType.APPLICATION_OCTET_STREAM_VALUE
                : request.getContentType();

        String storageKey;
        try {
            storageKey = storageService.store(String.valueOf(id), displayName, contentType, bytes);
        } catch (ArtifactStorageService.StorageUnavailableException exception) {
            throw ApiException.internalError("ARTIFACT_STORAGE_UNAVAILABLE",
                    exception.getMessage() == null
                            ? "Evidence storage is unavailable."
                            : exception.getMessage());
        }

        Artifact artifact = artifactRepository.save(
                new Artifact(id, artifactType, displayName, storageKey, contentType, bytes.length));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new ArtifactResponseDto(
                        artifact.getId(),
                        artifact.getExecutionId(),
                        artifact.getArtifactType(),
                        artifact.getDisplayName(),
                        artifact.getByteSize(),
                        artifact.getCreatedAt()));
    }

    private void requireExecution(Long id) {
        if (executionRepository.findById(id).isEmpty()) {
            throw ApiException.notFound("EXECUTION_NOT_FOUND",
                    "Execution %d does not exist.".formatted(id));
        }
    }

    private ExecutionEventType parseEventType(String raw) {
        try {
            return ExecutionEventType.valueOf(raw);
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw ApiException.badRequest("INVALID_EVENT_TYPE",
                    "Unknown event type: %s".formatted(raw));
        }
    }

    private String normalizeType(String raw) {
        String type = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
        if (!ARTIFACT_TYPES.contains(type)) {
            throw ApiException.badRequest("INVALID_ARTIFACT_TYPE",
                    "Artifact type must be one of SCREENSHOT, TRACE, CONSOLE_LOG, NETWORK_LOG.");
        }
        return type;
    }

    private String sanitizeName(String raw) {
        String name = raw == null ? "" : raw.trim().replaceAll("[^\\w.-]+", "-");
        if (name.isBlank()) {
            throw ApiException.badRequest("INVALID_ARTIFACT_NAME",
                    "Artifact name is required.");
        }
        return name.length() > 200 ? name.substring(0, 200) : name;
    }
}
