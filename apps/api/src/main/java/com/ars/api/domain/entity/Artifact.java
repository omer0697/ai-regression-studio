package com.ars.api.domain.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/** Metadata for an evidence artifact stored in object storage (Phase 2+). */
@Entity
@Table(name = "artifact")
public class Artifact {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "execution_id")
    private Long executionId;

    @Column(name = "artifact_type", nullable = false, length = 30)
    private String artifactType;

    @Column(name = "display_name", nullable = false, length = 200)
    private String displayName;

    @Column(name = "storage_key", nullable = false, length = 400)
    private String storageKey;

    @Column(name = "mime_type", length = 100)
    private String mimeType;

    @Column(name = "byte_size")
    private Long byteSize;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Artifact() {
    }

    public Artifact(Long executionId, String artifactType, String displayName, String storageKey,
            String mimeType, long byteSize) {
        this.executionId = executionId;
        this.artifactType = artifactType;
        this.displayName = displayName;
        this.storageKey = storageKey;
        this.mimeType = mimeType;
        this.byteSize = byteSize;
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

    public String getArtifactType() {
        return artifactType;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getStorageKey() {
        return storageKey;
    }

    public String getMimeType() {
        return mimeType;
    }

    public Long getByteSize() {
        return byteSize;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
