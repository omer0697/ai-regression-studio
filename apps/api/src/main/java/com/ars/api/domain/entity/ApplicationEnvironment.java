package com.ars.api.domain.entity;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import com.ars.api.domain.enums.AppType;
import com.ars.api.domain.enums.AuthMethod;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * A configured application environment (legacy GWT or React).
 *
 * <p>Note on credentials: only a reference name is stored here. The worker
 * resolves the referenced secret through a secure channel at execution time;
 * plaintext credentials never live in this database or travel in job payloads.</p>
 */
@Entity
@Table(name = "application_environment")
public class ApplicationEnvironment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    @Enumerated(EnumType.STRING)
    @Column(name = "app_type", nullable = false, length = 16)
    private AppType appType;

    @Column(name = "display_name", nullable = false, length = 80)
    private String displayName;

    @Column(name = "base_url", nullable = false, length = 500)
    private String baseUrl;

    @Column(name = "environment_label", nullable = false, length = 40)
    private String environmentLabel;

    @Enumerated(EnumType.STRING)
    @Column(name = "auth_method", nullable = false, length = 40)
    private AuthMethod authMethod = AuthMethod.NONE;

    @Column(name = "credential_reference", length = 120)
    private String credentialReference;

    @Column(name = "login_url", length = 500)
    private String loginUrl;

    @Column(name = "username_selector", length = 300)
    private String usernameSelector;

    @Column(name = "password_selector", length = 300)
    private String passwordSelector;

    @Column(name = "submit_selector", length = 300)
    private String submitSelector;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "allowed_domains", nullable = false, columnDefinition = "jsonb")
    private List<String> allowedDomains = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "allowed_actions", nullable = false, columnDefinition = "jsonb")
    private List<String> allowedActions = new ArrayList<>(List.of("safe-exploration"));

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "prohibited_actions", nullable = false, columnDefinition = "jsonb")
    private List<String> prohibitedActions =
            new ArrayList<>(List.of("submit", "publish", "delete", "approve", "sign", "send"));

    @Column(name = "browser_timeout_ms", nullable = false)
    private int browserTimeoutMs = 30_000;

    @Column(name = "screenshot_enabled", nullable = false)
    private boolean screenshotEnabled = true;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ApplicationEnvironment() {
    }

    public ApplicationEnvironment(Long projectId, AppType appType, String displayName, String baseUrl,
            String environmentLabel) {
        this.projectId = projectId;
        this.appType = appType;
        this.displayName = displayName;
        this.baseUrl = baseUrl;
        this.environmentLabel = environmentLabel;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public Long getProjectId() {
        return projectId;
    }

    public AppType getAppType() {
        return appType;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getEnvironmentLabel() {
        return environmentLabel;
    }

    public void setEnvironmentLabel(String environmentLabel) {
        this.environmentLabel = environmentLabel;
    }

    public AuthMethod getAuthMethod() {
        return authMethod;
    }

    public void setAuthMethod(AuthMethod authMethod) {
        this.authMethod = authMethod;
    }

    public String getCredentialReference() {
        return credentialReference;
    }

    public void setCredentialReference(String credentialReference) {
        this.credentialReference = credentialReference;
    }

    public String getLoginUrl() {
        return loginUrl;
    }

    public void setLoginUrl(String loginUrl) {
        this.loginUrl = loginUrl;
    }

    public String getUsernameSelector() {
        return usernameSelector;
    }

    public void setUsernameSelector(String usernameSelector) {
        this.usernameSelector = usernameSelector;
    }

    public String getPasswordSelector() {
        return passwordSelector;
    }

    public void setPasswordSelector(String passwordSelector) {
        this.passwordSelector = passwordSelector;
    }

    public String getSubmitSelector() {
        return submitSelector;
    }

    public void setSubmitSelector(String submitSelector) {
        this.submitSelector = submitSelector;
    }

    public List<String> getAllowedDomains() {
        return allowedDomains;
    }

    public void setAllowedDomains(List<String> allowedDomains) {
        this.allowedDomains = allowedDomains == null ? new ArrayList<>() : new ArrayList<>(allowedDomains);
    }

    public List<String> getAllowedActions() {
        return allowedActions;
    }

    public void setAllowedActions(List<String> allowedActions) {
        this.allowedActions = allowedActions == null ? new ArrayList<>() : new ArrayList<>(allowedActions);
    }

    public List<String> getProhibitedActions() {
        return prohibitedActions;
    }

    public void setProhibitedActions(List<String> prohibitedActions) {
        this.prohibitedActions =
                prohibitedActions == null ? new ArrayList<>() : new ArrayList<>(prohibitedActions);
    }

    public int getBrowserTimeoutMs() {
        return browserTimeoutMs;
    }

    public void setBrowserTimeoutMs(int browserTimeoutMs) {
        this.browserTimeoutMs = browserTimeoutMs;
    }

    public boolean isScreenshotEnabled() {
        return screenshotEnabled;
    }

    public void setScreenshotEnabled(boolean screenshotEnabled) {
        this.screenshotEnabled = screenshotEnabled;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
