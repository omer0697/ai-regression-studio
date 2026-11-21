package com.ars.api.controller;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.ars.api.domain.repository.TestExecutionRepository;
import com.ars.api.dto.ExecutionEventListResponse;
import com.ars.api.dto.ExecutionStartRequest;
import com.ars.api.dto.ExecutionView;
import com.ars.api.service.ExecutionEventService;
import com.ars.api.service.ExecutionService;
import com.ars.api.sse.ExecutionEventStreamer;
import com.ars.api.web.ApiException;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api")
@Tag(name = "Executions", description = "Start test executions and follow their progress.")
public class ExecutionController {

    private final ExecutionService executionService;
    private final ExecutionEventService eventService;
    private final ExecutionEventStreamer streamer;
    private final TestExecutionRepository executionRepository;

    public ExecutionController(
            ExecutionService executionService,
            ExecutionEventService eventService,
            ExecutionEventStreamer streamer,
            TestExecutionRepository executionRepository) {
        this.executionService = executionService;
        this.eventService = eventService;
        this.streamer = streamer;
        this.executionRepository = executionRepository;
    }

    @PostMapping("/projects/{projectId}/executions")
    @PreAuthorize("hasAnyRole('ADMIN','TESTER')")
    public ResponseEntity<ExecutionView> start(
            @PathVariable Long projectId,
            @Valid @RequestBody ExecutionStartRequest request,
            Authentication authentication) {
        ExecutionView execution = executionService.start(
                projectId, request.screenId(), request.mode(), ProjectController.actor(authentication));
        return ResponseEntity.status(HttpStatus.CREATED).body(execution);
    }

    @GetMapping("/executions")
    public List<ExecutionView> list() {
        return executionRepository.findRecentWithNames();
    }

    @GetMapping("/projects/{projectId}/executions")
    public List<ExecutionView> listByProject(@PathVariable Long projectId) {
        return executionRepository.findRecentByProjectIdWithNames(projectId);
    }

    @GetMapping("/executions/{id}")
    public ExecutionView get(@PathVariable Long id) {
        return executionRepository.findByIdWithNames(id)
                .orElseThrow(() -> ApiException.notFound("EXECUTION_NOT_FOUND",
                        "Execution %d does not exist.".formatted(id)));
    }

    /** JSON snapshot of recorded events (used by the UI as a stream fallback). */
    @GetMapping(value = "/executions/{id}/events", produces = MediaType.APPLICATION_JSON_VALUE)
    public ExecutionEventListResponse eventsSnapshot(
            @PathVariable Long id, @RequestParam(defaultValue = "0") long from) {
        requireExecution(id);
        return new ExecutionEventListResponse(eventService.listAfter(id, from));
    }

    /** Live event stream for the execution page. */
    @GetMapping(value = "/executions/{id}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "SSE stream of execution events and status changes.")
    public SseEmitter streamEvents(
            @PathVariable Long id, @RequestParam(defaultValue = "0") long from) {
        requireExecution(id);
        return streamer.stream(id, from);
    }

    private void requireExecution(Long id) {
        if (executionRepository.findById(id).isEmpty()) {
            throw ApiException.notFound("EXECUTION_NOT_FOUND",
                    "Execution %d does not exist.".formatted(id));
        }
    }
}
