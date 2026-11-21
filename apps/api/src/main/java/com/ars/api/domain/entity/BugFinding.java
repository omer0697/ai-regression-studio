package com.ars.api.domain.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/** An evidence-backed behavioral difference between GWT and React. */
@Entity
@Table(name = "bug_finding")
public class BugFinding {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "bug_code", nullable = false, length = 40, unique = true)
    private String bugCode;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    @Column(name = "execution_id", nullable = false)
    private Long executionId;

    @Column(name = "screen_code", nullable = false, length = 32)
    private String screenCode;

    @Column(nullable = false, length = 40)
    private String category;

    @Column(nullable = false, length = 20)
    private String severity;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(name = "expected_behavior", length = 1000)
    private String expectedBehavior;

    @Column(name = "actual_behavior", length = 1000)
    private String actualBehavior;

    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(name = "reproduction_json", columnDefinition = "jsonb")
    private java.util.Map<String, Object> reproduction;

    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(name = "evidence_artifacts", columnDefinition = "jsonb")
    private java.util.List<String> evidenceArtifacts;

    @Column(name = "ai_hypothesis", length = 2000)
    private String aiHypothesis;

    @Column(nullable = false, length = 20)
    private String status = "DETECTED";

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected BugFinding() {
    }

    public BugFinding(String bugCode, Long projectId, Long executionId, String screenCode,
            String category, String severity, String title) {
        this.bugCode = bugCode;
        this.projectId = projectId;
        this.executionId = executionId;
        this.screenCode = screenCode;
        this.category = category;
        this.severity = severity;
        this.title = title;
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

    public String getBugCode() {
        return bugCode;
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

    public String getCategory() {
        return category;
    }

    public String getSeverity() {
        return severity;
    }

    public String getTitle() {
        return title;
    }

    public String getExpectedBehavior() {
        return expectedBehavior;
    }

    public void setExpectedBehavior(String expectedBehavior) {
        this.expectedBehavior = expectedBehavior;
    }

    public String getActualBehavior() {
        return actualBehavior;
    }

    public void setActualBehavior(String actualBehavior) {
        this.actualBehavior = actualBehavior;
    }

    public java.util.Map<String, Object> getReproduction() {
        return reproduction;
    }

    public void setReproduction(java.util.Map<String, Object> reproduction) {
        this.reproduction = reproduction;
    }

    public java.util.List<String> getEvidenceArtifacts() {
        return evidenceArtifacts;
    }

    public void setEvidenceArtifacts(java.util.List<String> evidenceArtifacts) {
        this.evidenceArtifacts = evidenceArtifacts;
    }

    public String getAiHypothesis() {
        return aiHypothesis;
    }

    public void setAiHypothesis(String aiHypothesis) {
        this.aiHypothesis = aiHypothesis;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
