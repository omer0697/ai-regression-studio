package com.ars.api.domain.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.ars.api.domain.entity.ExecutionEvent;

public interface ExecutionEventRepository extends JpaRepository<ExecutionEvent, Long> {

    List<ExecutionEvent> findByExecutionIdAndSeqGreaterThanEqualOrderBySeqAsc(Long executionId, long fromSeq);

    List<ExecutionEvent> findByExecutionIdOrderBySeqAsc(Long executionId);

    @Query("select coalesce(max(e.seq), 0) from ExecutionEvent e where e.executionId = :executionId")
    long findMaxSeq(Long executionId);
}
