package com.ars.api.domain.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.ars.api.domain.entity.DiscoveredElement;

public interface DiscoveredElementRepository extends JpaRepository<DiscoveredElement, Long> {

    List<DiscoveredElement> findByExecutionIdOrderByElementRefAsc(Long executionId);

    long countByExecutionId(Long executionId);
}
