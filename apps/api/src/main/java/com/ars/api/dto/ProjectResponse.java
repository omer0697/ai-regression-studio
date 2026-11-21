package com.ars.api.dto;

import java.time.Instant;
import java.util.List;

public record ProjectResponse(
        Long id,
        String name,
        String description,
        String environmentName,
        boolean active,
        Instant createdAt,
        long environmentCount,
        long screenCount,
        long executionCount,
        List<EnvironmentResponse> environments,
        List<ScreenResponse> screens) {
}
