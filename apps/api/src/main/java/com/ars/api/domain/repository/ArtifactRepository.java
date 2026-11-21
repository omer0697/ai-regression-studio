package com.ars.api.domain.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.ars.api.domain.entity.Artifact;

public interface ArtifactRepository extends JpaRepository<Artifact, Long> {

    List<Artifact> findByExecutionIdOrderByIdAsc(Long executionId);
}
