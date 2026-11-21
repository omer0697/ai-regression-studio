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

/** A product requirement imported from Confluence and linked to a screen. */
@Entity
@Table(name = "requirement_definition")
public class RequirementDefinition {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    @Column(name = "screen_code", nullable = false, length = 32)
    private String screenCode;

    @Column(name = "confluence_id", length = 120)
    private String confluenceId;

    @Column(nullable = false, length = 300)
    private String title;

    @Column(columnDefinition = "text")
    private String content;

    @Column(name = "source_url", length = 500)
    private String sourceUrl;

    @Column(nullable = false, length = 20)
    private String status = "PENDING";

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "coverage_json", columnDefinition = "jsonb")
    private Map<String, Object> coverage;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected RequirementDefinition() {
    }

    public RequirementDefinition(Long projectId, String screenCode, String title) {
        this.projectId = projectId;
        this.screenCode = screenCode;
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

    public Long getProjectId() {
        return projectId;
    }

    public String getScreenCode() {
        return screenCode;
    }

    public String getConfluenceId() {
        return confluenceId;
    }

    public void setConfluenceId(String confluenceId) {
        this.confluenceId = confluenceId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getSourceUrl() {
        return sourceUrl;
    }

    public void setSourceUrl(String sourceUrl) {
        this.sourceUrl = sourceUrl;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Map<String, Object> getCoverage() {
        return coverage;
    }

    public void setCoverage(Map<String, Object> coverage) {
        this.coverage = coverage;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
