package com.ars.api.dto;

import java.util.Map;

/** Standard error envelope for all API failures. */
public record ApiErrorResponse(String code, String message, Map<String, String> fieldErrors) {
}
