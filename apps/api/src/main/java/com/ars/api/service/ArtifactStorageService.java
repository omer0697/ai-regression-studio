package com.ars.api.service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.ars.api.config.AppProperties;

import io.minio.BucketExistsArgs;
import io.minio.GetObjectArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.errors.ErrorResponseException;
import io.minio.errors.InsufficientDataException;
import io.minio.errors.InternalException;
import io.minio.errors.InvalidResponseException;
import io.minio.errors.ServerException;
import io.minio.errors.XmlParserException;

import java.security.GeneralSecurityException;

/**
 * Evidence artifact storage with two interchangeable backends:
 *
 * <ul>
 *   <li>{@code s3} — MinIO/S3-compatible object storage (shared deployments).</li>
 *   <li>{@code filesystem} — a plain directory on the local disk
 *       ({@code ARS_STORAGE_DIR}, default {@code ./data/artifacts}). This is
 *       the zero-Docker local mode used together with the {@code sqlite}
 *       profile.</li>
 * </ul>
 *
 * <p>Binary artifacts never live in the SQL database in either mode.</p>
 */
@Service
public class ArtifactStorageService {

    private static final Logger log = LoggerFactory.getLogger(ArtifactStorageService.class);

    private final AppProperties properties;
    private final MinioClient client;
    private volatile boolean bucketVerified;

    public ArtifactStorageService(AppProperties properties) {
        this.properties = properties;
        this.client = properties.storage().enabled()
                ? MinioClient.builder()
                        .endpoint(properties.storage().endpoint())
                        .credentials(properties.storage().accessKey(), properties.storage().secretKey())
                        .build()
                : null;
    }

    public boolean enabled() {
        return filesystemMode() || client != null;
    }

    public boolean filesystemMode() {
        return properties.storage().filesystemMode();
    }

    /** Uploads bytes and returns the storage key. */
    public String store(String executionKey, String fileName, String contentType, byte[] bytes)
            throws StorageUnavailableException {
        String key = "executions/%s/%s-%s".formatted(executionKey, UUID.randomUUID(), fileName);
        if (filesystemMode()) {
            storeOnFilesystem(key, bytes);
            return key;
        }
        if (!enabled()) {
            throw new StorageUnavailableException(
                    "Artifact storage is not configured (ARS_STORAGE_MODE / ARS_MINIO_ENDPOINT).");
        }
        try {
            ensureBucket();
            try (InputStream stream = new ByteArrayInputStream(bytes)) {
                client.putObject(PutObjectArgs.builder()
                        .bucket(properties.storage().bucket())
                        .object(key)
                        .stream(stream, bytes.length, -1)
                        .contentType(contentType)
                        .build());
            }
            return key;
        } catch (ErrorResponseException | InsufficientDataException | InternalException
                | InvalidResponseException | ServerException | XmlParserException
                | IOException | GeneralSecurityException exception) {
            log.error("Artifact upload failed for {}: {}", key, exception.getMessage());
            throw new StorageUnavailableException("Artifact storage rejected the upload.");
        }
    }

    public InputStream retrieve(String key) throws StorageUnavailableException {
        if (filesystemMode()) {
            return retrieveFromFilesystem(key);
        }
        if (!enabled()) {
            throw new StorageUnavailableException("Artifact storage is not configured.");
        }
        try {
            return client.getObject(GetObjectArgs.builder()
                    .bucket(properties.storage().bucket())
                    .object(key)
                    .build());
        } catch (ErrorResponseException | InsufficientDataException | InternalException
                | InvalidResponseException | ServerException | XmlParserException
                | IOException | GeneralSecurityException exception) {
            throw new StorageUnavailableException("Artifact could not be retrieved.");
        }
    }

    // ------------------------------------------------------------------
    // filesystem backend
    // ------------------------------------------------------------------

    private Path resolveFilesystemKey(String key) {
        // Defense-in-depth: reject traversal attempts in keys.
        if (key == null || key.isBlank() || key.contains("..") || key.startsWith("/")
                || key.contains("\\")) {
            throw new IllegalArgumentException("Invalid artifact key.");
        }
        return Path.of(properties.storage().dir()).resolve(key);
    }

    private void storeOnFilesystem(String key, byte[] bytes) throws StorageUnavailableException {
        try {
            Path target = resolveFilesystemKey(key);
            Files.createDirectories(target.getParent());
            Files.copy(new ByteArrayInputStream(bytes), target, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException | IllegalArgumentException exception) {
            log.error("Filesystem artifact upload failed for {}: {}", key, exception.getMessage());
            throw new StorageUnavailableException("Local artifact directory rejected the upload.");
        }
    }

    private InputStream retrieveFromFilesystem(String key) throws StorageUnavailableException {
        try {
            Path source = resolveFilesystemKey(key);
            if (!Files.isRegularFile(source)) {
                throw new StorageUnavailableException("Artifact file is missing.");
            }
            return Files.newInputStream(source);
        } catch (IOException | IllegalArgumentException exception) {
            throw new StorageUnavailableException("Artifact could not be read from disk.");
        }
    }

    private void ensureBucket()
            throws ErrorResponseException, InsufficientDataException, InternalException,
            InvalidResponseException, ServerException, XmlParserException, IOException,
            GeneralSecurityException {
        if (bucketVerified) {
            return;
        }
        String bucket = properties.storage().bucket();
        if (!client.bucketExists(BucketExistsArgs.builder().bucket(bucket).build())) {
            client.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
            log.info("Created missing evidence bucket '{}'.", bucket);
        }
        bucketVerified = true;
    }

    /** Raised when artifact storage is unavailable; never masked as success. */
    public static class StorageUnavailableException extends Exception {

        public StorageUnavailableException(String message) {
            super(message);
        }
    }
}
