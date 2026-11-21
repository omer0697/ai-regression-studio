package com.ars.api.service;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
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
import io.minio.messages.ErrorResponse;

import java.io.IOException;
import java.security.GeneralSecurityException;

/**
 * S3-compatible evidence storage backed by MinIO. Binary artifacts
 * (screenshots, traces, logs) live in object storage — never in PostgreSQL.
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
        return client != null;
    }

    /** Uploads bytes and returns the storage key. */
    public String store(String executionKey, String fileName, String contentType, byte[] bytes)
            throws StorageUnavailableException {
        if (!enabled()) {
            throw new StorageUnavailableException(
                    "Artifact storage is not configured (ARS_MINIO_ENDPOINT is blank).");
        }
        String key = "executions/%s/%s-%s".formatted(executionKey, UUID.randomUUID(), fileName);
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

    /** Raised when object storage is unavailable; never masked as success. */
    public static class StorageUnavailableException extends Exception {

        public StorageUnavailableException(String message) {
            super(message);
        }
    }
}
