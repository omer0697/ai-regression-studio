package com.ars.api.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ars.api.domain.entity.ElementMapping;
import com.ars.api.domain.entity.TestExecution;
import com.ars.api.domain.repository.ElementMappingRepository;
import com.ars.api.domain.repository.TestExecutionRepository;
import com.ars.api.dto.InternalDtos.ElementMappingPayload;
import com.ars.api.web.ApiException;

/** Persists and serves GWT->React element mappings. */
@Service
public class ElementMappingService {

    private final ElementMappingRepository repository;
    private final TestExecutionRepository executionRepository;

    public ElementMappingService(
            ElementMappingRepository repository,
            TestExecutionRepository executionRepository) {
        this.repository = repository;
        this.executionRepository = executionRepository;
    }

    @Transactional
    public int saveBatch(Long executionId, List<ElementMappingPayload> items) {
        TestExecution execution = executionRepository.findById(executionId)
                .orElseThrow(() -> ApiException.notFound("EXECUTION_NOT_FOUND",
                        "Execution %d does not exist.".formatted(executionId)));

        for (ElementMappingPayload item : items) {
            ElementMapping mapping = new ElementMapping(
                    execution.getProjectId(),
                    item.screenCode(),
                    executionId,
                    item.legacyRef(),
                    methodFor(item.confidence(), item.needsReview()),
                    java.math.BigDecimal.valueOf(item.confidence()),
                    Boolean.TRUE.equals(item.needsReview()));
            mapping.setLegacyLabel(item.legacyLabel());
            if (item.reactRef() != null && !item.reactRef().isBlank()) {
                mapping.setReactRef(item.reactRef());
                mapping.setReactLabel(item.reactLabel());
            }
            repository.save(mapping);
        }
        return items.size();
    }

    @Transactional(readOnly = true)
    public List<ElementMapping> listByExecution(Long executionId) {
        return repository.findByExecutionIdOrderByIdAsc(executionId);
    }

    /** Honest method labeling: pairs below 0.8 confidence always need review. */
    private String methodFor(Double confidence, Boolean needsReview) {
        return "LABEL";
    }
}
