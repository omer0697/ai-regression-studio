package com.ars.api.domain.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

@Entity
@Table(name = "screen_definition")
public class ScreenDefinition {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    @Column(name = "screen_code", nullable = false, length = 32)
    private String screenCode;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(name = "legacy_route", length = 300)
    private String legacyRoute;

    @Column(name = "react_route", length = 300)
    private String reactRoute;

    @Column(name = "navigation_notes", columnDefinition = "text")
    private String navigationNotes;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ScreenDefinition() {
    }

    public ScreenDefinition(Long projectId, String screenCode, String name) {
        this.projectId = projectId;
        this.screenCode = screenCode;
        this.name = name;
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

    public String getScreenCode() {
        return screenCode;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getLegacyRoute() {
        return legacyRoute;
    }

    public void setLegacyRoute(String legacyRoute) {
        this.legacyRoute = legacyRoute;
    }

    public String getReactRoute() {
        return reactRoute;
    }

    public void setReactRoute(String reactRoute) {
        this.reactRoute = reactRoute;
    }

    public String getNavigationNotes() {
        return navigationNotes;
    }

    public void setNavigationNotes(String navigationNotes) {
        this.navigationNotes = navigationNotes;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
