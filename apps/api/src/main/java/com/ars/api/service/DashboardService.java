package com.ars.api.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ars.api.domain.repository.ProjectRepository;
import com.ars.api.domain.repository.TestExecutionRepository;
import com.ars.api.dto.DashboardResponse;
import com.ars.api.dto.ExecutionView;
import com.ars.api.dto.WorkerStatusResponse;

@Service
public class DashboardService {

    private final ProjectRepository projectRepository;
    private final TestExecutionRepository executionRepository;
    private final WorkerClient workerClient;

    public DashboardService(
            ProjectRepository projectRepository,
            TestExecutionRepository executionRepository,
            WorkerClient workerClient) {
        this.projectRepository = projectRepository;
        this.executionRepository = executionRepository;
        this.workerClient = workerClient;
    }

    @Transactional(readOnly = true)
    public DashboardResponse dashboard() {
        WorkerClient.WorkerHealth health = workerClient.health();
        List<ExecutionView> recent = executionRepository.findRecentWithNames().stream()
                .limit(10)
                .toList();

        return new DashboardResponse(
                projectRepository.count(),
                projectRepository.countByActiveTrue(),
                executionRepository.count(),
                new WorkerStatusResponse(
                        health.configured(),
                        health.reachable(),
                        health.detail(),
                        health.capabilities()),
                recent);
    }
}
