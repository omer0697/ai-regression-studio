package com.ars.api.dto;

import com.ars.api.domain.enums.UserRole;

public record SessionUserResponse(String username, String displayName, UserRole role) {
}
