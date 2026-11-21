package com.ars.api.domain.entity;

import java.time.Instant;
import java.util.List;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/** A normalized element discovered on a target screen (Phase 2+). */
@Entity
@Table(name = "discovered_element")
public class DiscoveredElement {

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

    @Column(name = "element_ref", nullable = false, length = 64)
    private String elementRef;

    @Column(length = 300)
    private String label;

    @Column(name = "element_type", nullable = false, length = 40)
    private String elementType;

    @Column(name = "accessible_name", length = 300)
    private String accessibleName;

    @Column(name = "current_value", length = 500)
    private String currentValue;

    @Column(nullable = false)
    private boolean enabled;

    @Column(nullable = false)
    private boolean visible;

    @Column(nullable = false)
    private Boolean required;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "options", columnDefinition = "jsonb")
    private List<String> options;

    @Column(name = "dom_path", length = 600)
    private String domPath;

    @Column(nullable = false)
    private java.math.BigDecimal confidence;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected DiscoveredElement() {
    }

    public DiscoveredElement(Long executionId, Long projectId, String appType, String screenCode,
            String elementRef, String elementType) {
        this.executionId = executionId;
        this.projectId = projectId;
        this.appType = appType;
        this.screenCode = screenCode;
        this.elementRef = elementRef;
        this.elementType = elementType;
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

    public String getAppType() {
        return appType;
    }

    public String getScreenCode() {
        return screenCode;
    }

    public String getElementRef() {
        return elementRef;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public String getElementType() {
        return elementType;
    }

    public String getAccessibleName() {
        return accessibleName;
    }

    public void setAccessibleName(String accessibleName) {
        this.accessibleName = accessibleName;
    }

    public String getCurrentValue() {
        return currentValue;
    }

    public void setCurrentValue(String currentValue) {
        this.currentValue = currentValue;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public boolean isVisible() {
        return visible;
    }

    public void setVisible(boolean visible) {
        this.visible = visible;
    }

    public Boolean getRequired() {
        return required;
    }

    public void setRequired(Boolean required) {
        this.required = required == null ? false : required;
    }

    public List<String> getOptions() {
        return options;
    }

    public void setOptions(List<String> options) {
        this.options = options == null ? null : List.copyOf(options);
    }

    public String getDomPath() {
        return domPath;
    }

    public void setDomPath(String domPath) {
        this.domPath = domPath;
    }

    public java.math.BigDecimal getConfidence() {
        return confidence;
    }

    public void setConfidence(java.math.BigDecimal confidence) {
        this.confidence = confidence;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
