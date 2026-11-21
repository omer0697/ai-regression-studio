package com.ars.api.service;

import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ars.api.domain.entity.DependencyObservation;
import com.ars.api.domain.entity.ScreenDefinition;
import com.ars.api.domain.entity.TestExecution;
import com.ars.api.domain.repository.DependencyObservationRepository;
import com.ars.api.domain.repository.ScreenDefinitionRepository;
import com.ars.api.domain.repository.TestExecutionRepository;
import com.ars.api.dto.InternalDtos.DependencyObservationPayload;
import com.ars.api.dto.InternalDtos.DependencyObservationResponse;
import com.ars.api.web.ApiException;

/** Persists and serves dependency observations from safe interaction exploration. */
@Service
public class DependencyObservationService {

    private static final Set<String> INTERACTIONS =
            Set.of("selectOption", "setCheckbox", "chooseRadio");
    private static final Set<String> ATTRIBUTES =
            Set.of("enabled", "visible", "value", "options", "required");

    private final DependencyObservationRepository repository;
    private final TestExecutionRepository executionRepository;
    private final ScreenDefinitionRepository screenRepository;

    public DependencyObservationService(
            DependencyObservationRepository repository,
            TestExecutionRepository executionRepository,
            ScreenDefinitionRepository screenRepository) {
        this.repository = repository;
        this.executionRepository = executionRepository;
        this.screenRepository = screenRepository;
    }

    @Transactional
    public int saveBatch(Long executionId, List<DependencyObservationPayload> items) {
        TestExecution execution = executionRepository.findById(executionId)
                .orElseThrow(() -> ApiException.notFound("EXECUTION_NOT_FOUND",
                        "Execution %d does not exist.".formatted(executionId)));
        ScreenDefinition screen = screenRepository.findById(execution.getScreenId())
                .orElseThrow(() -> ApiException.notFound("SCREEN_NOT_FOUND",
                        "Screen %d does not exist.".formatted(execution.getScreenId())));

        for (DependencyObservationPayload item : items) {
            validate(item);
            DependencyObservation observation = new DependencyObservation(
                    execution.getId(),
                    execution.getProjectId(),
                    item.appType(),
                    screen.getScreenCode(),
                    item.sourceRef(),
                    item.interaction(),
                    item.affectedRef(),
                    item.attribute());
            observation.setSourceLabel(blankToNull(item.sourceLabel()));
            observation.setValue(blankToNull(item.value()));
            observation.setAffectedLabel(blankToNull(item.affectedLabel()));
            observation.setBeforeValue(blankToNull(item.beforeValue()));
            observation.setAfterValue(blankToNull(item.afterValue()));
            observation.setReverted(item.reverted() == null || item.reverted());
            repository.save(observation);
        }
        return items.size();
    }

    @Transactional(readOnly = true)
    public List<DependencyObservationResponse> listByExecution(Long executionId) {
        return repository.findByExecutionIdOrderByIdAsc(executionId).stream()
                .map(observation -> new DependencyObservationResponse(
                        observation.getId(),
                        observation.getExecutionId(),
                        observation.getAppType(),
                        observation.getScreenCode(),
                        observation.getSourceRef(),
                        observation.getSourceLabel(),
                        observation.getInteraction(),
                        observation.getValue(),
                        observation.getAffectedRef(),
                        observation.getAffectedLabel(),
                        observation.getAttribute(),
                        observation.getBeforeValue(),
                        observation.getAfterValue(),
                        observation.isReverted(),
                        observation.getObservedAt()))
                .toList();
    }

    /**
     * The worker reports the target app type per batch; discovery runs explore
     * the legacy screen while later phases explore React and compare.
     */
    private void validate(DependencyObservationPayload item) {
        if (!INTERACTIONS.contains(item.interaction())) {
            throw ApiException.badRequest("INVALID_INTERACTION",
                    "Unknown interaction: %s".formatted(item.interaction()));
        }
        if (!ATTRIBUTES.contains(item.attribute())) {
            throw ApiException.badRequest("INVALID_ATTRIBUTE",
                    "Unknown attribute: %s".formatted(item.attribute()));
        }
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
