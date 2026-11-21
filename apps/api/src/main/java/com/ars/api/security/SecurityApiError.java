package com.ars.api.security;

/** Small JSON body used by the security handlers. */
public record SecurityApiError(String code, String message) {
}
