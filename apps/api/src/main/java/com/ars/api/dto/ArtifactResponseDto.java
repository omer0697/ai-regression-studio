package com.ars.api.dto;

import java.time.Instant;

/** User-facing artifact metadata (content is streamed from object storage). */
public record ArtifactResponseDto(
        Long id,
        Long executionId,
        String artifactType,
        String displayName,
        Long byteSize,
        Instant createdAt) {
}
