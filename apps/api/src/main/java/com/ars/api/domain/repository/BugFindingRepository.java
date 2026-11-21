package com.ars.api.domain.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.ars.api.domain.entity.BugFinding;

public interface BugFindingRepository extends JpaRepository<BugFinding, Long> {

    List<BugFinding> findByExecutionIdOrderByIdAsc(Long executionId);

    List<BugFinding> findByProjectIdOrderByCreatedAtDesc(Long projectId);

    List<BugFinding> findByScreenCodeAndStatusOrderByCreatedAtDesc(String screenCode, String status);

    List<BugFinding> findAllByOrderByCreatedAtDesc();

    long countByScreenCode(String screenCode);

    Optional<BugFinding> findByBugCode(String bugCode);
}
