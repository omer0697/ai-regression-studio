package com.ars.api.sse;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.ars.api.domain.entity.ExecutionEvent;
import com.ars.api.domain.entity.TestExecution;
import com.ars.api.domain.enums.ExecutionStatus;
import com.ars.api.domain.repository.ExecutionEventRepository;
import com.ars.api.domain.repository.TestExecutionRepository;
import com.ars.api.dto.ExecutionEventResponse;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.annotation.PreDestroy;

/**
 * Streams execution events over Server-Sent Events.
 *
 * <p>Each client gets a scheduled task that polls the event table for new
 * rows and the execution status for completion. Phase 2 replaces polling with
 * worker push callbacks; the client contract stays the same.</p>
 */
@Service
public class ExecutionEventStreamer {

    private static final Logger log = LoggerFactory.getLogger(ExecutionEventStreamer.class);
    private static final long POLL_INTERVAL_MS = 500;
    private static final long COMPLETION_GRACE_MS = 2_000;
    private static final long HEARTBEAT_INTERVAL_MS = 15_000;

    private final ExecutionEventRepository eventRepository;
    private final TestExecutionRepository executionRepository;
    private final ObjectMapper objectMapper;

    private final ScheduledExecutorService scheduler =
            Executors.newScheduledThreadPool(2, runnable -> {
                Thread thread = new Thread(runnable, "execution-sse");
                thread.setDaemon(true);
                return thread;
            });

    public ExecutionEventStreamer(
            ExecutionEventRepository eventRepository,
            TestExecutionRepository executionRepository,
            ObjectMapper objectMapper) {
        this.eventRepository = eventRepository;
        this.executionRepository = executionRepository;
        this.objectMapper = objectMapper;
    }

    public SseEmitter stream(Long executionId, long fromSeq) {
        SseEmitter emitter = new SseEmitter(0L);
        AtomicLong cursor = new AtomicLong(fromSeq);
        AtomicBoolean stopped = new AtomicBoolean(false);
        AtomicLong lastHeartbeat = new AtomicLong(System.currentTimeMillis());

        ScheduledFuture<?> future = scheduler.scheduleAtFixedRate(
                () -> pollAndSend(emitter, executionId, cursor, stopped, lastHeartbeat),
                250, POLL_INTERVAL_MS, TimeUnit.MILLISECONDS);

        Runnable stop = () -> {
            if (stopped.compareAndSet(false, true)) {
                future.cancel(false);
            }
        };
        emitter.onCompletion(stop);
        emitter.onTimeout(stop);
        emitter.onError(error -> stop.run());

        return emitter;
    }

    private void pollAndSend(SseEmitter emitter, Long executionId, AtomicLong cursor,
            AtomicBoolean stopped, AtomicLong lastHeartbeat) {
        if (stopped.get()) {
            return;
        }
        try {
            List<ExecutionEvent> events = eventRepository
                    .findByExecutionIdAndSeqGreaterThanEqualOrderBySeqAsc(executionId, cursor.get());
            for (ExecutionEvent event : events) {
                emitter.send(SseEmitter.event()
                        .name("event")
                        .data(toJson(ExecutionEventResponse.from(event)), MediaType.APPLICATION_JSON));
                cursor.set(event.getSeq());
            }

            TestExecution execution = executionRepository.findById(executionId).orElse(null);
            if (execution == null) {
                emitter.send(SseEmitter.event()
                        .name("status")
                        .data("{\"status\":\"CANCELLED\"}", MediaType.APPLICATION_JSON));
                emitter.complete();
                return;
            }

            emitter.send(SseEmitter.event()
                    .name("status")
                    .data(toJson(new StatusPayload(execution.getStatus().name())),
                            MediaType.APPLICATION_JSON));

            if (execution.getStatus().isTerminal()) {
                // Give late events a short grace period, then close the stream.
                try {
                    Thread.sleep(COMPLETION_GRACE_MS);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                }
                List<ExecutionEvent> remaining = eventRepository
                        .findByExecutionIdAndSeqGreaterThanEqualOrderBySeqAsc(executionId, cursor.get());
                for (ExecutionEvent event : remaining) {
                    emitter.send(SseEmitter.event()
                            .name("event")
                            .data(toJson(ExecutionEventResponse.from(event)), MediaType.APPLICATION_JSON));
                    cursor.set(event.getSeq());
                }
                emitter.complete();
                return;
            }

            long now = System.currentTimeMillis();
            if (now - lastHeartbeat.get() > HEARTBEAT_INTERVAL_MS) {
                emitter.send(SseEmitter.event().comment("keep-alive"));
                lastHeartbeat.set(now);
            }
        } catch (IOException | IllegalStateException exception) {
            // Client disconnected or the emitter was already completed.
            emitter.completeWithError(exception);
        } catch (RuntimeException exception) {
            log.warn("Failed to stream execution events for {}: {}",
                    executionId, exception.getMessage());
            emitter.completeWithError(exception);
        }
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (IOException exception) {
            return "{}";
        }
    }

    record StatusPayload(String status) {
    }

    @PreDestroy
    void shutdown() {
        scheduler.shutdownNow();
    }
}
