package com.ars.api.domain.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.ars.api.domain.entity.ScreenDefinition;

public interface ScreenDefinitionRepository extends JpaRepository<ScreenDefinition, Long> {

    List<ScreenDefinition> findByProjectIdOrderByScreenCodeAsc(Long projectId);

    Optional<ScreenDefinition> findByIdAndProjectId(Long id, Long projectId);

    boolean existsByProjectIdAndScreenCodeIgnoreCase(Long projectId, String screenCode);

    long countByProjectId(Long projectId);
}
