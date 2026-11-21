package com.ars.api.dto;

import java.time.Instant;

import com.ars.api.domain.entity.ScreenDefinition;

public record ScreenResponse(
        Long id,
        Long projectId,
        String screenCode,
        String name,
        String legacyRoute,
        String reactRoute,
        String navigationNotes,
        boolean active,
        Instant createdAt) {

    public static ScreenResponse from(ScreenDefinition entity) {
        return new ScreenResponse(
                entity.getId(),
                entity.getProjectId(),
                entity.getScreenCode(),
                entity.getName(),
                entity.getLegacyRoute(),
                entity.getReactRoute(),
                entity.getNavigationNotes(),
                entity.isActive(),
                entity.getCreatedAt());
    }
}
