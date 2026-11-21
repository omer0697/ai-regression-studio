package com.ars.api.domain.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.ars.api.domain.entity.Project;

public interface ProjectRepository extends JpaRepository<Project, Long> {

    boolean existsByNameIgnoreCase(String name);

    List<Project> findAllByOrderByCreatedAtDesc();

    Optional<Project> findByIdAndActiveTrue(Long id);

    long countByActiveTrue();
}
