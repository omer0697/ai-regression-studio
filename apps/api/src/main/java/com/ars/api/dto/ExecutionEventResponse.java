package com.ars.api.dto;

import java.time.Instant;
import java.util.Map;

import com.ars.api.domain.entity.ExecutionEvent;
import com.ars.api.domain.enums.ExecutionEventType;

public record ExecutionEventResponse(
        long seq,
        ExecutionEventType type,
        String message,
        Map<String, Object> payload,
        Instant createdAt) {

    public static ExecutionEventResponse from(ExecutionEvent entity) {
        return new ExecutionEventResponse(
                entity.getSeq(),
                entity.getType(),
                entity.getMessage(),
                entity.getPayload(),
                entity.getCreatedAt());
    }
}
