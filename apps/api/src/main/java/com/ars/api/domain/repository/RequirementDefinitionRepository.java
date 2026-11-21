package com.ars.api.domain.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.ars.api.domain.entity.RequirementDefinition;

public interface RequirementDefinitionRepository extends JpaRepository<RequirementDefinition, Long> {

    List<RequirementDefinition> findByProjectIdAndScreenCodeOrderByIdAsc(Long projectId, String screenCode);

    List<RequirementDefinition> findByProjectIdOrderByIdAsc(Long projectId);

    boolean existsByProjectIdAndScreenCodeAndConfluenceId(Long projectId, String screenCode,
            String confluenceId);
}
