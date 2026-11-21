package com.ars.api.domain.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/** A GWT -> React element alignment pair; low-confidence pairs need review. */
@Entity
@Table(name = "element_mapping")
public class ElementMapping {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    @Column(name = "screen_code", nullable = false, length = 32)
    private String screenCode;

    @Column(name = "execution_id", nullable = false)
    private Long executionId;

    @Column(name = "legacy_ref", nullable = false, length = 64)
    private String legacyRef;

    @Column(name = "legacy_label", length = 300)
    private String legacyLabel;

    @Column(name = "react_ref", length = 64)
    private String reactRef;

    @Column(name = "react_label", length = 300)
    private String reactLabel;

    @Column(nullable = false)
    private java.math.BigDecimal confidence;

    @Column(nullable = false, length = 20)
    private String method;

    @Column(name = "needs_review", nullable = false)
    private boolean needsReview;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected ElementMapping() {
    }

    public ElementMapping(Long projectId, String screenCode, Long executionId, String legacyRef,
            String method, java.math.BigDecimal confidence, boolean needsReview) {
        this.projectId = projectId;
        this.screenCode = screenCode;
        this.executionId = executionId;
        this.legacyRef = legacyRef;
        this.method = method;
        this.confidence = confidence;
        this.needsReview = needsReview;
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

    public String getScreenCode() {
        return screenCode;
    }

    public Long getExecutionId() {
        return executionId;
    }

    public String getLegacyRef() {
        return legacyRef;
    }

    public String getLegacyLabel() {
        return legacyLabel;
    }

    public void setLegacyLabel(String legacyLabel) {
        this.legacyLabel = legacyLabel;
    }

    public String getReactRef() {
        return reactRef;
    }

    public void setReactRef(String reactRef) {
        this.reactRef = reactRef;
    }

    public String getReactLabel() {
        return reactLabel;
    }

    public void setReactLabel(String reactLabel) {
        this.reactLabel = reactLabel;
    }

    public java.math.BigDecimal getConfidence() {
        return confidence;
    }

    public String getMethod() {
        return method;
    }

    public boolean isNeedsReview() {
        return needsReview;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
