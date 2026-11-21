package com.ars.api.dto;

import java.util.List;

public record DashboardResponse(
        long totalProjects,
        long activeProjects,
        long totalExecutions,
        WorkerStatusResponse worker,
        List<ExecutionView> recentExecutions) {
}
