package com.ars.api.domain.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.ars.api.domain.entity.ElementMapping;

public interface ElementMappingRepository extends JpaRepository<ElementMapping, Long> {

    List<ElementMapping> findByExecutionIdOrderByIdAsc(Long executionId);

    List<ElementMapping> findByProjectIdAndScreenCodeOrderByLegacyRefAsc(Long projectId, String screenCode);
}
