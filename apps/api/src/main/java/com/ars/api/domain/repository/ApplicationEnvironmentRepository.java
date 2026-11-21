package com.ars.api.domain.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.ars.api.domain.entity.ApplicationEnvironment;
import com.ars.api.domain.enums.AppType;

public interface ApplicationEnvironmentRepository extends JpaRepository<ApplicationEnvironment, Long> {

    List<ApplicationEnvironment> findByProjectIdOrderByAppTypeAsc(Long projectId);

    Optional<ApplicationEnvironment> findByProjectIdAndAppType(Long projectId, AppType appType);

    boolean existsByProjectIdAndAppType(Long projectId, AppType appType);

    long countByProjectId(Long projectId);

    void deleteByProjectIdAndId(Long projectId, Long id);
}
