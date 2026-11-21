package com.ars.api.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ars.api.domain.entity.ExecutionEvent;
import com.ars.api.domain.enums.ExecutionEventType;
import com.ars.api.domain.repository.ExecutionEventRepository;
import com.ars.api.dto.ExecutionEventResponse;

/**
 * Ordered event log per execution. Sequence numbers are allocated from a
 * per-execution counter; Phase 2 will move to an idempotent callback model
 * when multiple writers (API + worker) exist.
 */
@Service
public class ExecutionEventService {

    private final ExecutionEventRepository repository;

    public ExecutionEventService(ExecutionEventRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public void append(Long executionId, ExecutionEventType type, String message,
            String payloadKey, Object payloadValue) {
        long nextSeq = repository.findMaxSeq(executionId) + 1;
        repository.save(new ExecutionEvent(executionId, nextSeq, type, message,
                payloadKey == null ? null : java.util.Map.of(payloadKey, payloadValue)));
    }

    @Transactional
    public void append(Long executionId, ExecutionEventType type, String message) {
        append(executionId, type, message, null, null);
    }

    @Transactional(readOnly = true)
    public List<ExecutionEventResponse> listAfter(Long executionId, long fromSeq) {
        return repository
                .findByExecutionIdAndSeqGreaterThanEqualOrderBySeqAsc(executionId, fromSeq)
                .stream()
                .map(ExecutionEventResponse::from)
                .toList();
    }
}
