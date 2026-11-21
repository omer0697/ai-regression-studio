package com.ars.api.dto;

import java.time.Instant;

public record ProjectSummaryResponse(
        Long id,
        String name,
        String description,
        String environmentName,
        boolean active,
        Instant createdAt,
        long environmentCount,
        long screenCount,
        long executionCount) {
}
