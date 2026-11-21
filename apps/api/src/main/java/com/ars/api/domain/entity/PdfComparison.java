package com.ars.api.domain.entity;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/** A stored PDF comparison run (Phase 6). */
@Entity
@Table(name = "pdf_comparison")
public class PdfComparison {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    @Column(name = "execution_id")
    private Long executionId;

    @Column(name = "screen_code", length = 32)
    private String screenCode;

    @Column(name = "source_a_name", nullable = false, length = 200)
    private String sourceAName;

    @Column(name = "source_b_name", nullable = false, length = 200)
    private String sourceBName;

    @Column(name = "pdf_a_key", nullable = false, length = 400)
    private String pdfAKey;

    @Column(name = "pdf_b_key", nullable = false, length = 400)
    private String pdfBKey;

    @Column(name = "pages_a")
    private Integer pagesA;

    @Column(name = "pages_b")
    private Integer pagesB;

    @Column(nullable = false, length = 20)
    private String verdict;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private List<Map<String, Object>> differences;

    @Column(name = "artifact_a_id")
    private Long artifactAId;

    @Column(name = "artifact_b_id")
    private Long artifactBId;

    @Column(name = "created_by", length = 64)
    private String createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected PdfComparison() {
    }

    public PdfComparison(
            Long projectId,
            String screenCode,
            String sourceAName,
            String sourceBName,
            String pdfAKey,
            String pdfBKey,
            Integer pagesA,
            Integer pagesB,
            String verdict,
            List<Map<String, Object>> differences) {
        this.projectId = projectId;
        this.screenCode = screenCode;
        this.sourceAName = sourceAName;
        this.sourceBName = sourceBName;
        this.pdfAKey = pdfAKey;
        this.pdfBKey = pdfBKey;
        this.pagesA = pagesA;
        this.pagesB = pagesB;
        this.verdict = verdict;
        this.differences = differences;
    }

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public Long getId() {
        return id;
    }

    public Long getProjectId() {
        return projectId;
    }

    public Long getExecutionId() {
        return executionId;
    }

    public String getScreenCode() {
        return screenCode;
    }

    public String getSourceAName() {
        return sourceAName;
    }

    public String getSourceBName() {
        return sourceBName;
    }

    public Integer getPagesA() {
        return pagesA;
    }

    public Integer getPagesB() {
        return pagesB;
    }

    public String getVerdict() {
        return verdict;
    }

    public List<Map<String, Object>> getDifferences() {
        return differences;
    }

    public Long getArtifactAId() {
        return artifactAId;
    }

    public void setArtifactAId(Long artifactAId) {
        this.artifactAId = artifactAId;
    }

    public Long getArtifactBId() {
        return artifactBId;
    }

    public void setArtifactBId(Long artifactBId) {
        this.artifactBId = artifactBId;
    }

    public String getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(String createdBy) {
        this.createdBy = createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
