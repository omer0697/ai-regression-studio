package com.ars.api.service;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.ars.api.domain.entity.AuditEvent;
import com.ars.api.domain.repository.AuditEventRepository;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Append-only audit trail. Audit failures must never break the business flow,
 * so every write is guarded and logged.
 */
@Service
public class AuditService {

    private static final Logger log = LoggerFactory.getLogger(AuditService.class);

    private final AuditEventRepository repository;

    public AuditService(AuditEventRepository repository) {
        this.repository = repository;
    }

    public void record(String actor, String action, String targetType, String targetId,
            Map<String, Object> details) {
        try {
            repository.save(new AuditEvent(actor, action, targetType, targetId, details, null));
        } catch (RuntimeException exception) {
            log.warn("Failed to persist audit event {}: {}", action, exception.getMessage());
        }
    }

    public void record(HttpServletRequest request, String actor, String action, String targetType,
            String targetId, Map<String, Object> details) {
        try {
            repository.save(new AuditEvent(actor, action, targetType, targetId, details,
                    request.getRemoteAddr()));
        } catch (RuntimeException exception) {
            log.warn("Failed to persist audit event {}: {}", action, exception.getMessage());
        }
    }
}
