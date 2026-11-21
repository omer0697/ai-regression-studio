package com.ars.api.domain.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.ars.api.domain.entity.DependencyObservation;

public interface DependencyObservationRepository extends JpaRepository<DependencyObservation, Long> {

    List<DependencyObservation> findByExecutionIdOrderByIdAsc(Long executionId);

    long countByExecutionId(Long executionId);
}
