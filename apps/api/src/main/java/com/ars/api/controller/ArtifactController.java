package com.ars.api.controller;

import java.util.List;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ars.api.domain.entity.Artifact;
import com.ars.api.domain.repository.ArtifactRepository;
import com.ars.api.domain.repository.TestExecutionRepository;
import com.ars.api.dto.ArtifactResponseDto;
import com.ars.api.dto.InternalDtos.DiscoveredElementResponse;
import com.ars.api.service.ArtifactStorageService;
import com.ars.api.service.DiscoveredElementService;
import com.ars.api.web.ApiException;

import io.swagger.v3.oas.annotations.tags.Tag;

/** Evidence access for the dashboard: metadata lists and content streaming. */
@RestController
@RequestMapping("/api")
@Tag(name = "Artifacts", description = "Execution evidence (screenshots, traces, logs).")
public class ArtifactController {

    private final ArtifactRepository artifactRepository;
    private final TestExecutionRepository executionRepository;
    private final DiscoveredElementService elementService;
    private final com.ars.api.service.DependencyObservationService observationService;
    private final ArtifactStorageService storageService;

    public ArtifactController(
            ArtifactRepository artifactRepository,
            TestExecutionRepository executionRepository,
            DiscoveredElementService elementService,
            com.ars.api.service.DependencyObservationService observationService,
            ArtifactStorageService storageService) {
        this.artifactRepository = artifactRepository;
        this.executionRepository = executionRepository;
        this.elementService = elementService;
        this.observationService = observationService;
        this.storageService = storageService;
    }

    @GetMapping("/executions/{id}/artifacts")
    public List<ArtifactResponseDto> listByExecution(@PathVariable Long id) {
        requireExecution(id);
        return artifactRepository.findByExecutionIdOrderByIdAsc(id).stream()
                .map(artifact -> new ArtifactResponseDto(
                        artifact.getId(),
                        artifact.getExecutionId(),
                        artifact.getArtifactType(),
                        artifact.getDisplayName(),
                        artifact.getByteSize(),
                        artifact.getCreatedAt()))
                .toList();
    }

    @GetMapping("/executions/{id}/elements")
    public List<DiscoveredElementResponse> listElements(@PathVariable Long id) {
        requireExecution(id);
        return elementService.listByExecution(id);
    }

    @GetMapping("/executions/{id}/observations")
    public List<com.ars.api.dto.InternalDtos.DependencyObservationResponse> listObservations(
            @PathVariable Long id) {
        requireExecution(id);
        return observationService.listByExecution(id);
    }

    /** Streams artifact bytes from object storage (session authenticated). */
    @GetMapping("/artifacts/{id}/content")
    public ResponseEntity<org.springframework.core.io.InputStreamResource> content(
            @PathVariable Long id) {
        Artifact artifact = artifactRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("ARTIFACT_NOT_FOUND",
                        "Artifact %d does not exist.".formatted(id)));

        if (!storageService.enabled()) {
            throw ApiException.internalError("ARTIFACT_STORAGE_UNAVAILABLE",
                    "Evidence storage is not configured.");
        }

        ArtifactStorageService.StorageUnavailableException[] failure = new ArtifactStorageService.StorageUnavailableException[1];
        var stream = new java.util.concurrent.atomic.AtomicReference<java.io.InputStream>();
        try {
            stream.set(storageService.retrieve(artifact.getStorageKey()));
        } catch (ArtifactStorageService.StorageUnavailableException exception) {
            throw ApiException.internalError("ARTIFACT_STORAGE_UNAVAILABLE",
                    "Evidence could not be retrieved from storage.");
        }

        String contentType = artifact.getMimeType() == null
                ? MediaType.APPLICATION_OCTET_STREAM_VALUE
                : artifact.getMimeType();

        return ResponseEntity.status(HttpStatus.OK)
                .header(HttpHeaders.CONTENT_TYPE, contentType)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\"%s\"".formatted(artifact.getDisplayName()))
                .body(new org.springframework.core.io.InputStreamResource(stream.get()));
    }

    private void requireExecution(Long id) {
        if (executionRepository.findById(id).isEmpty()) {
            throw ApiException.notFound("EXECUTION_NOT_FOUND",
                    "Execution %d does not exist.".formatted(id));
        }
    }
}
