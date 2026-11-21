package com.ars.api.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ars.api.domain.entity.DiscoveredElement;
import com.ars.api.domain.entity.ScreenDefinition;
import com.ars.api.domain.entity.TestExecution;
import com.ars.api.domain.repository.DiscoveredElementRepository;
import com.ars.api.domain.repository.ScreenDefinitionRepository;
import com.ars.api.domain.repository.TestExecutionRepository;
import com.ars.api.dto.InternalDtos.DiscoveredElementPayload;
import com.ars.api.dto.InternalDtos.DiscoveredElementResponse;
import com.ars.api.web.ApiException;

@Service
public class DiscoveredElementService {

    private final DiscoveredElementRepository repository;
    private final TestExecutionRepository executionRepository;
    private final ScreenDefinitionRepository screenRepository;

    public DiscoveredElementService(
            DiscoveredElementRepository repository,
            TestExecutionRepository executionRepository,
            ScreenDefinitionRepository screenRepository) {
        this.repository = repository;
        this.executionRepository = executionRepository;
        this.screenRepository = screenRepository;
    }

    /** Persists a normalized discovery batch (bounded by the DTO validation). */
    @Transactional
    public int saveBatch(Long executionId, List<DiscoveredElementPayload> items) {
        TestExecution execution = executionRepository.findById(executionId)
                .orElseThrow(() -> ApiException.notFound("EXECUTION_NOT_FOUND",
                        "Execution %d does not exist.".formatted(executionId)));
        ScreenDefinition screen = screenRepository.findById(execution.getScreenId())
                .orElseThrow(() -> ApiException.notFound("SCREEN_NOT_FOUND",
                        "Screen %d does not exist.".formatted(execution.getScreenId())));

        for (DiscoveredElementPayload item : items) {
            DiscoveredElement element = new DiscoveredElement(
                    execution.getId(),
                    execution.getProjectId(),
                    item.appType(),
                    screen.getScreenCode(),
                    item.ref(),
                    item.elementType());
            element.setLabel(blankToNull(item.label()));
            element.setAccessibleName(blankToNull(item.accessibleName()));
            element.setCurrentValue(blankToNull(item.value()));
            element.setEnabled(item.enabled() == null || item.enabled());
            element.setVisible(item.visible() == null || item.visible());
            element.setRequired(item.required());
            element.setOptions(item.options() == null ? null : List.copyOf(item.options()));
            element.setLocatorCandidates(
                    item.locatorCandidates() == null ? null : List.copyOf(item.locatorCandidates()));
            element.setDomPath(blankToNull(item.domPath()));
            element.setConfidence(
                    item.confidence() == null
                            ? java.math.BigDecimal.ZERO
                            : java.math.BigDecimal.valueOf(item.confidence()));
            repository.save(element);
        }
        return items.size();
    }

    @Transactional(readOnly = true)
    public List<DiscoveredElementResponse> listByExecution(Long executionId) {
        return repository.findByExecutionIdOrderByElementRefAsc(executionId).stream()
                .map(element -> new DiscoveredElementResponse(
                        element.getId(),
                        element.getExecutionId(),
                        element.getAppType(),
                        element.getScreenCode(),
                        element.getElementRef(),
                        element.getLabel(),
                        element.getElementType(),
                        element.getAccessibleName(),
                        element.getCurrentValue(),
                        element.isEnabled(),
                        element.isVisible(),
                        element.getRequired(),
                        element.getOptions(),
                        element.getLocatorCandidates(),
                        element.getDomPath(),
                        element.getConfidence() == null
                                ? null
                                : element.getConfidence().doubleValue()))
                .toList();
    }

    @Transactional(readOnly = true)
    public long countByExecution(Long executionId) {
        return repository.countByExecutionId(executionId);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
