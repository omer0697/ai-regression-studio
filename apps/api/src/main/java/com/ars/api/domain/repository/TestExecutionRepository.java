package com.ars.api.domain.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.ars.api.domain.entity.TestExecution;
import com.ars.api.domain.enums.ExecutionMode;
import com.ars.api.domain.enums.ExecutionStatus;
import com.ars.api.dto.ExecutionView;

public interface TestExecutionRepository extends JpaRepository<TestExecution, Long> {

    List<TestExecution> findTop100ByOrderByCreatedAtDesc();

    List<TestExecution> findTop50ByProjectIdOrderByCreatedAtDesc(Long projectId);

    boolean existsByScreenIdAndStatusIn(Long screenId, List<ExecutionStatus> statuses);

    long countByProjectId(Long projectId);

    /** Reads one execution with joined project/screen/user names. */
    @Query("""
            select new com.ars.api.dto.ExecutionView(
                e.id, e.projectId, p.name, e.screenId, s.screenCode, s.name,
                e.mode, e.status, e.errorCode, e.statusMessage,
                e.totalSteps, e.passedSteps, e.failedSteps, e.skippedSteps,
                u.username, e.createdAt, e.startedAt, e.finishedAt)
            from TestExecution e
            join Project p on p.id = e.projectId
            join ScreenDefinition s on s.id = e.screenId
            left join UserAccount u on u.id = e.createdBy
            where e.id = :id
            """)
    Optional<ExecutionView> findByIdWithNames(Long id);

    @Query("""
            select new com.ars.api.dto.ExecutionView(
                e.id, e.projectId, p.name, e.screenId, s.screenCode, s.name,
                e.mode, e.status, e.errorCode, e.statusMessage,
                e.totalSteps, e.passedSteps, e.failedSteps, e.skippedSteps,
                u.username, e.createdAt, e.startedAt, e.finishedAt)
            from TestExecution e
            join Project p on p.id = e.projectId
            join ScreenDefinition s on s.id = e.screenId
            left join UserAccount u on u.id = e.createdBy
            where e.projectId = :projectId
            order by e.createdAt desc
            """)
    List<ExecutionView> findRecentByProjectIdWithNames(Long projectId);

    @Query("""
            select new com.ars.api.dto.ExecutionView(
                e.id, e.projectId, p.name, e.screenId, s.screenCode, s.name,
                e.mode, e.status, e.errorCode, e.statusMessage,
                e.totalSteps, e.passedSteps, e.failedSteps, e.skippedSteps,
                u.username, e.createdAt, e.startedAt, e.finishedAt)
            from TestExecution e
            join Project p on p.id = e.projectId
            join ScreenDefinition s on s.id = e.screenId
            left join UserAccount u on u.id = e.createdBy
            order by e.createdAt desc
            """)
    List<ExecutionView> findRecentWithNames();
}
