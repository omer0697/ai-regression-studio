package com.ars.api.controller;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ars.api.web.ApiException;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Phase 8: document workflow status. Signature and encryption workflows are
 * reported honestly as REQUIRES_MANUAL_VERIFICATION — the platform never
 * claims a pass it cannot evidence (master prompt §11/§12: unsupported
 * hardware-token or key-management flows must be marked for manual
 * verification instead of reporting a false pass).
 */
@RestController
@RequestMapping("/api")
@Tag(name = "Document Workflows", description = "Signature/encryption workflow status.")
public class DocumentWorkflowController {

    public record WorkflowStatus(
            String workflow,
            String status,
            String reason) {
    }

    @GetMapping("/projects/{projectId}/screens/{screenCode}/document-workflows")
    public ResponseEntity<List<WorkflowStatus>> workflows(
            @PathVariable Long projectId,
            @PathVariable String screenCode) {
        return ResponseEntity.ok(List.of(
                new WorkflowStatus(
                        "ELECTRONIC_SIGNATURE",
                        "REQUIRES_MANUAL_VERIFICATION",
                        "Imza akışı donanım token veya şirket onaylı imza servisi gerektirir. "
                                + "Platform, anahtar yönetimi yapılandırılana kadar bu akışı "
                                + "geçti olarak raporlamaz; manuel doğrulama listesinde tutar."),
                new WorkflowStatus(
                        "ENCRYPTION",
                        "REQUIRES_MANUAL_VERIFICATION",
                        "Şifreleme/çözme doğrulaması onaylı test anahtarları ve izole anahtar "
                                + "yönetimi gerektirir. Anahtar deposu entegrasyonu tamamlanana "
                                + "kadar bu akış doğrulanmamıştır.")));
    }
}
