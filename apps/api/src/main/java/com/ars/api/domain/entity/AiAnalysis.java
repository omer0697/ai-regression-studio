package com.ars.api.domain.entity;

import java.time.Instant;
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

/** Record of every AI interaction: model, status, parsed output. Never faked. */
@Entity
@Table(name = "ai_analysis")
public class AiAnalysis {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "execution_id")
    private Long executionId;

    @Column(name = "project_id")
    private Long projectId;

    @Column(nullable = false, length = 30)
    private String kind;

    @Column(length = 120)
    private String model;

    @Column(nullable = false, length = 30)
    private String status;

    @Column(length = 2000)
    private String summary;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "output_json", columnDefinition = "jsonb")
    private Map<String, Object> outputJson;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected AiAnalysis() {
    }

    public AiAnalysis(Long executionId, Long projectId, String kind, String model,
            String status, String summary, Map<String, Object> outputJson) {
        this.executionId = executionId;
        this.projectId = projectId;
        this.kind = kind;
        this.model = model;
        this.status = status;
        this.summary = summary;
        this.outputJson = outputJson;
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

    public Long getExecutionId() {
        return executionId;
    }

    public Long getProjectId() {
        return projectId;
    }

    public String getKind() {
        return kind;
    }

    public String getModel() {
        return model;
    }

    public String getStatus() {
        return status;
    }

    public String getSummary() {
        return summary;
    }

    public Map<String, Object> getOutputJson() {
        return outputJson;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
