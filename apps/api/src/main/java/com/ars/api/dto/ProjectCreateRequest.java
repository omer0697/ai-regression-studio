package com.ars.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ProjectCreateRequest(
        @NotBlank(message = "Project name is required.")
        @Size(min = 2, max = 80, message = "Project name must be between 2 and 80 characters.")
        String name,

        @Size(max = 600, message = "Description must be at most 600 characters.")
        String description,

        @NotBlank(message = "Environment name is required.")
        @Size(max = 40, message = "Environment name must be at most 40 characters.")
        String environmentName) {
}
