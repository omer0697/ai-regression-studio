package com.ars.api.domain.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.ars.api.domain.entity.TestScenario;

public interface TestScenarioRepository extends JpaRepository<TestScenario, Long> {

    List<TestScenario> findByProjectIdOrderByCreatedAtDesc(Long projectId);

    List<TestScenario> findByScreenIdOrderByCreatedAtDesc(Long screenId);

    Optional<TestScenario> findByIdAndProjectId(Long id, Long projectId);

    Optional<TestScenario> findFirstByScreenIdAndStatusOrderByIdDesc(Long screenId, String status);
}
