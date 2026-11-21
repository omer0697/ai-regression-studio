package com.ars.api.dto;

import com.ars.api.domain.enums.ExecutionMode;

import jakarta.validation.constraints.NotNull;

public record ExecutionStartRequest(
        @NotNull(message = "Screen is required.")
        Long screenId,

        @NotNull(message = "Mode is required.")
        ExecutionMode mode) {
}
