package com.ars.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ScreenRequest(
        @NotBlank(message = "Screen code is required.")
        @Size(min = 2, max = 32, message = "Screen code must be between 2 and 32 characters.")
        @Pattern(regexp = "^[A-Z][A-Z0-9_-]{1,31}$",
                message = "Screen code must be uppercase letters, digits, '_' or '-' (e.g. KPY68).")
        String screenCode,

        @NotBlank(message = "Screen name is required.")
        @Size(max = 120, message = "Screen name must be at most 120 characters.")
        String name,

        @Size(max = 300, message = "Legacy route must be at most 300 characters.")
        String legacyRoute,

        @Size(max = 300, message = "React route must be at most 300 characters.")
        String reactRoute,

        @Size(max = 4000, message = "Navigation notes must be at most 4000 characters.")
        String navigationNotes) {
}
