package com.ars.api.domain.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/**
 * A dependency observation produced by Phase 3 safe interaction exploration:
 * applying an interaction on the source element changed the given attribute of
 * the affected element from beforeValue to afterValue.
 */
@Entity
@Table(name = "dependency_observation")
public class DependencyObservation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "execution_id", nullable = false)
    private Long executionId;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    @Column(name = "app_type", nullable = false, length = 16)
    private String appType;

    @Column(name = "screen_code", nullable = false, length = 32)
    private String screenCode;

    @Column(name = "source_ref", nullable = false, length = 64)
    private String sourceRef;

    @Column(name = "source_label", length = 300)
    private String sourceLabel;

    @Column(nullable = false, length = 40)
    private String interaction;

    @Column(length = 300)
    private String value;

    @Column(name = "affected_ref", nullable = false, length = 64)
    private String affectedRef;

    @Column(name = "affected_label", length = 300)
    private String affectedLabel;

    @Column(nullable = false, length = 40)
    private String attribute;

    @Column(name = "before_value", length = 500)
    private String beforeValue;

    @Column(name = "after_value", length = 500)
    private String afterValue;

    @Column(nullable = false)
    private boolean reverted;

    @Column(name = "observed_at", nullable = false)
    private Instant observedAt;

    protected DependencyObservation() {
    }

    public DependencyObservation(
            Long executionId,
            Long projectId,
            String appType,
            String screenCode,
            String sourceRef,
            String interaction,
            String affectedRef,
            String attribute) {
        this.executionId = executionId;
        this.projectId = projectId;
        this.appType = appType;
        this.screenCode = screenCode;
        this.sourceRef = sourceRef;
        this.interaction = interaction;
        this.affectedRef = affectedRef;
        this.attribute = attribute;
    }

    @PrePersist
    void onCreate() {
        if (observedAt == null) {
            observedAt = Instant.now();
        }
    }

    public Long getId() {
        return id;
    }

    public Long getExecutionId() {
        return executionId;
    }

    public Long getProjectId() {
        return projectId;
    }

    public String getAppType() {
        return appType;
    }

    public String getScreenCode() {
        return screenCode;
    }

    public String getSourceRef() {
        return sourceRef;
    }

    public void setSourceLabel(String sourceLabel) {
        this.sourceLabel = sourceLabel;
    }

    public String getSourceLabel() {
        return sourceLabel;
    }

    public String getInteraction() {
        return interaction;
    }

    public void setValue(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }

    public String getAffectedRef() {
        return affectedRef;
    }

    public void setAffectedLabel(String affectedLabel) {
        this.affectedLabel = affectedLabel;
    }

    public String getAffectedLabel() {
        return affectedLabel;
    }

    public String getAttribute() {
        return attribute;
    }

    public void setBeforeValue(String beforeValue) {
        this.beforeValue = beforeValue;
    }

    public String getBeforeValue() {
        return beforeValue;
    }

    public void setAfterValue(String afterValue) {
        this.afterValue = afterValue;
    }

    public String getAfterValue() {
        return afterValue;
    }

    public void setReverted(boolean reverted) {
        this.reverted = reverted;
    }

    public boolean isReverted() {
        return reverted;
    }

    public Instant getObservedAt() {
        return observedAt;
    }
}
