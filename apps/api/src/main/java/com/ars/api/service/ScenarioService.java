package com.ars.api.service;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ars.api.domain.entity.TestScenario;
import com.ars.api.domain.repository.TestScenarioRepository;
import com.ars.api.web.ApiException;

/** Scenario library with an explicit human approval gate. */
@Service
public class ScenarioService {

    private final TestScenarioRepository repository;
    private final AuditService audit;

    public ScenarioService(TestScenarioRepository repository, AuditService audit) {
        this.repository = repository;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<TestScenario> listByProject(Long projectId) {
        return repository.findByProjectIdOrderByCreatedAtDesc(projectId);
    }

    @Transactional(readOnly = true)
    public List<TestScenario> listByScreen(Long screenId) {
        return repository.findByScreenIdOrderByCreatedAtDesc(screenId);
    }

    @Transactional(readOnly = true)
    public TestScenario get(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("SCENARIO_NOT_FOUND",
                        "Scenario %d does not exist.".formatted(id)));
    }

    @Transactional
    public TestScenario approve(Long id, String actor) {
        TestScenario scenario = get(id);
        if (!"PROPOSED".equals(scenario.getStatus())) {
            throw ApiException.conflict("SCENARIO_NOT_PROPOSED",
                    "Only PROPOSED scenarios can be approved (current: %s)."
                            .formatted(scenario.getStatus()));
        }
        scenario.setStatus("APPROVED");
        scenario.setApprovedBy(actor);
        scenario.setApprovedAt(Instant.now());
        scenario = repository.save(scenario);
        audit.record(actor, "SCENARIO_APPROVED", "TEST_SCENARIO", String.valueOf(id), null);
        return scenario;
    }

    @Transactional
    public TestScenario reject(Long id, String actor, String reason) {
        TestScenario scenario = get(id);
        if (!"PROPOSED".equals(scenario.getStatus())) {
            throw ApiException.conflict("SCENARIO_NOT_PROPOSED",
                    "Only PROPOSED scenarios can be rejected (current: %s)."
                            .formatted(scenario.getStatus()));
        }
        scenario.setStatus("REJECTED");
        scenario.setApprovedBy(actor);
        scenario.setApprovedAt(Instant.now());
        scenario = repository.save(scenario);
        audit.record(actor, "SCENARIO_REJECTED", "TEST_SCENARIO", String.valueOf(id),
                reason == null ? null : Map.of("reason", reason));
        return scenario;
    }
}
