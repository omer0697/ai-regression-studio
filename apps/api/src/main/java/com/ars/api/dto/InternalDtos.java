package com.ars.api.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Worker -> API payloads for the internal callback channel. */
public final class InternalDtos {

    private InternalDtos() {
    }

    public record InternalEventRequest(
            @NotNull(message = "Event type is required.") String type,
            @NotBlank(message = "Event message is required.")
            @Size(max = 1000, message = "Event message must be at most 1000 characters.")
            String message,
            java.util.Map<String, Object> payload) {
    }

    public record InternalStatusRequest(
            @NotNull(message = "Status is required.") String status,
            @Size(max = 600, message = "Status message must be at most 600 characters.")
            String statusMessage,
            @Size(max = 60, message = "Error code must be at most 60 characters.")
            String errorCode,
            Integer totalSteps,
            Integer passedSteps,
            Integer failedSteps,
            Integer skippedSteps) {
    }

    public record DiscoveredElementPayload(
            @NotBlank @Size(max = 64) String ref,
            @Size(max = 300) String label,
            @NotBlank @Size(max = 40) String elementType,
            @Size(max = 300) String accessibleName,
            @Size(max = 500) String value,
            Boolean enabled,
            Boolean visible,
            Boolean required,
            List<String> options,
            @Size(max = 600) String domPath,
            Double confidence,
            @NotBlank @Size(max = 16) String appType) {
    }

    public record InternalElementsRequest(
            @NotNull @Size(min = 1, max = 500, message = "At most 500 elements per batch.")
            List<@Valid DiscoveredElementPayload> items) {
    }

    public record ArtifactResponse(
            Long id,
            Long executionId,
            String artifactType,
            String displayName,
            Long byteSize,
            java.time.Instant createdAt) {
    }

    public record DiscoveredElementResponse(
            Long id,
            Long executionId,
            String appType,
            String screenCode,
            String ref,
            String label,
            String elementType,
            String accessibleName,
            String value,
            boolean enabled,
            boolean visible,
            Boolean required,
            List<String> options,
            String domPath,
            Double confidence) {
    }
}
