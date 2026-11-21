package com.ars.api.domain.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.ars.api.domain.entity.PdfComparison;

public interface PdfComparisonRepository extends JpaRepository<PdfComparison, Long> {

    List<PdfComparison> findByProjectIdOrderByCreatedAtDesc(Long projectId);
}
