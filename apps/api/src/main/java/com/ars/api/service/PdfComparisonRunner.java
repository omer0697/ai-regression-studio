package com.ars.api.service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ars.api.domain.entity.Artifact;
import com.ars.api.domain.entity.PdfComparison;
import com.ars.api.domain.repository.ArtifactRepository;
import com.ars.api.domain.repository.PdfComparisonRepository;
import com.ars.api.domain.repository.ProjectRepository;
import com.ars.api.web.ApiException;

/**
 * Runs PDF comparisons for a project: stores both documents as evidence
 * artifacts (MinIO), compares them structurally and persists the result.
 */
@Service
public class PdfComparisonRunner {

    private final PdfComparisonService comparisonService;
    private final PdfComparisonRepository repository;
    private final ProjectRepository projectRepository;
    private final ArtifactRepository artifactRepository;
    private final ArtifactStorageService storageService;
    private final AuditService audit;

    public PdfComparisonRunner(
            PdfComparisonService comparisonService,
            PdfComparisonRepository repository,
            ProjectRepository projectRepository,
            ArtifactRepository artifactRepository,
            ArtifactStorageService storageService,
            AuditService audit) {
        this.comparisonService = comparisonService;
        this.repository = repository;
        this.projectRepository = projectRepository;
        this.artifactRepository = artifactRepository;
        this.storageService = storageService;
        this.audit = audit;
    }

    public record PdfComparisonResponse(
            Long id,
            String verdict,
            int pagesA,
            int pagesB,
            List<Map<String, Object>> differences,
            Long artifactAId,
            Long artifactBId,
            Instant createdAt) {
    }

    @Transactional
    public PdfComparisonResponse compare(
            Long projectId,
            String screenCode,
            String sourceAName,
            byte[] pdfA,
            String sourceBName,
            byte[] pdfB,
            Map<String, String> expectedFields,
            String actor) {

        projectRepository.findByIdAndActiveTrue(projectId)
                .orElseThrow(() -> ApiException.notFound("PROJECT_NOT_FOUND",
                        "Project %d does not exist.".formatted(projectId)));

        if (expectedFields == null || expectedFields.isEmpty()) {
            throw ApiException.badRequest("MISSING_EXPECTED_FIELDS",
                    "expectedFields must contain at least one field to verify.");
        }

        PdfComparisonService.PdfContent contentA;
        PdfComparisonService.PdfContent contentB;
        try {
            contentA = comparisonService.extract(pdfA);
            contentB = comparisonService.extract(pdfB);
        } catch (Exception exception) {
            throw ApiException.badRequest("INVALID_PDF",
                    "One of the documents is not a parseable PDF: %s"
                            .formatted(exception.getMessage()));
        }

        PdfComparisonService.PdfComparisonResult result =
                comparisonService.compare(contentA, contentB, expectedFields);

        Long artifactAId = storeArtifact(projectId, sourceAName, pdfA);
        Long artifactBId = storeArtifact(projectId, sourceBName, pdfB);

        PdfComparison record = new PdfComparison(
                projectId,
                screenCode,
                sourceAName,
                sourceBName,
                "inline",
                "inline",
                result.pagesA(),
                result.pagesB(),
                result.verdict(),
                comparisonService.differencesToJson(result.differences()));
        record.setArtifactAId(artifactAId);
        record.setArtifactBId(artifactBId);
        record.setCreatedBy(actor);
        record = repository.save(record);

        audit.record(actor, "PDF_COMPARISON_RUN", "PDF_COMPARISON",
                String.valueOf(record.getId()),
                Map.of("verdict", result.verdict(),
                        "differences", result.differences().size()));

        return new PdfComparisonResponse(
                record.getId(),
                result.verdict(),
                result.pagesA(),
                result.pagesB(),
                record.getDifferences(),
                artifactAId,
                artifactBId,
                record.getCreatedAt());
    }

    private Long storeArtifact(Long projectId, String name, byte[] pdf) {
        try {
            String key = storageService.store(
                    "pdf-" + java.util.UUID.randomUUID(),
                    name.endsWith(".pdf") ? name : name + ".pdf",
                    "application/pdf",
                    pdf);
            Artifact artifact = artifactRepository.save(
                    new Artifact(null, "PDF",
                            name.endsWith(".pdf") ? name : name + ".pdf",
                            key, "application/pdf", pdf.length));
            return artifact.getId();
        } catch (ArtifactStorageService.StorageUnavailableException exception) {
            throw ApiException.internalError("ARTIFACT_STORAGE_UNAVAILABLE",
                    "PDF evidence could not be stored: %s".formatted(exception.getMessage()));
        }
    }
}
