package com.ars.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
        @NotBlank(message = "Username is required.") @Size(max = 64) String username,
        @NotBlank(message = "Password is required.") @Size(max = 128) String password) {
}
