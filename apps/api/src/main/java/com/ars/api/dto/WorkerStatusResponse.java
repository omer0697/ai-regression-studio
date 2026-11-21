package com.ars.api.dto;

import java.util.Map;

/** Worker reachability and capability report rendered on the dashboard. */
public record WorkerStatusResponse(
        boolean configured,
        boolean reachable,
        String detail,
        Map<String, Boolean> capabilities) {
}
