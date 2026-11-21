package com.ars.api.controller;

import java.util.List;
import java.util.Map;

import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ars.api.service.PdfComparisonRunner;
import com.ars.api.web.ApiException;

import io.swagger.v3.oas.annotations.tags.Tag;

/** PDF document comparison endpoints (Phase 6). */
@RestController
@RequestMapping("/api")
@Tag(name = "PDF", description = "Structural PDF comparison for document workflows.")
public class PdfComparisonController {

    private final PdfComparisonRunner runner;
    private final com.ars.api.domain.repository.PdfComparisonRepository repository;
    private final ObjectMapper objectMapper;

    public PdfComparisonController(
            PdfComparisonRunner runner,
            com.ars.api.domain.repository.PdfComparisonRepository repository,
            ObjectMapper objectMapper) {
        this.runner = runner;
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    public record PdfCompareRequest(
            @org.springframework.lang.Nullable String screenCode,
            @org.springframework.lang.Nullable String expectedFieldsJson) {
    }

    /**
     * Accepts two PDF documents and a JSON map of expected fields
     * ({"Etiket": "beklenen deger", ...}); returns the structural comparison.
     */
    @PostMapping(value = "/projects/{projectId}/pdf/compare", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAnyRole('ADMIN','TESTER')")
    public Map<String, Object> compare(
            @PathVariable Long projectId,
            @RequestParam("pdfA") MultipartFile pdfA,
            @RequestParam("pdfB") MultipartFile pdfB,
            @RequestParam(value = "screenCode", required = false) String screenCode,
            @RequestParam("expectedFields") String expectedFieldsJson,
            Authentication authentication) {

        byte[] a = readPdf(pdfA, "pdfA");
        byte[] b = readPdf(pdfB, "pdfB");

        Map<String, String> expectedFields = parseExpectedFields(expectedFieldsJson);

        try {
            var result = runner.compare(
                    projectId,
                    screenCode,
                    pdfA.getOriginalFilename() == null ? "belge-a.pdf" : pdfA.getOriginalFilename(),
                    a,
                    pdfB.getOriginalFilename() == null ? "belge-b.pdf" : pdfB.getOriginalFilename(),
                    b,
                    expectedFields,
                    ProjectController.actor(authentication));

            Map<String, Object> response = new java.util.LinkedHashMap<>();
            response.put("id", result.id());
            response.put("verdict", result.verdict());
            response.put("pagesA", result.pagesA());
            response.put("pagesB", result.pagesB());
            response.put("differences", result.differences());
            response.put("artifactAId", result.artifactAId());
            response.put("artifactBId", result.artifactBId());
            response.put("createdAt", result.createdAt());
            return response;
        } catch (Exception exception) {
            throw ApiException.internalError("PDF_COMPARISON_FAILED",
                    exception.getMessage() == null ? "Comparison failed." : exception.getMessage());
        }
    }

    @GetMapping("/projects/{projectId}/pdf/comparisons")
    public List<Map<String, Object>> history(@PathVariable Long projectId) {
        return repository.findByProjectIdOrderByCreatedAtDesc(projectId).stream()
                .map(record -> {
                    Map<String, Object> item = new java.util.LinkedHashMap<>();
                    item.put("id", record.getId());
                    item.put("screenCode", record.getScreenCode());
                    item.put("sourceAName", record.getSourceAName());
                    item.put("sourceBName", record.getSourceBName());
                    item.put("pagesA", record.getPagesA());
                    item.put("pagesB", record.getPagesB());
                    item.put("verdict", record.getVerdict());
                    item.put("differences", record.getDifferences());
                    item.put("createdAt", record.getCreatedAt());
                    return item;
                })
                .toList();
    }

    private byte[] readPdf(MultipartFile file, String field) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("MISSING_PDF",
                    "Document '%s' is required.".formatted(field));
        }
        try {
            return file.getBytes();
        } catch (Exception exception) {
            throw ApiException.badRequest("INVALID_PDF",
                    "Document '%s' could not be read.".formatted(field));
        }
    }

    private Map<String, String> parseExpectedFields(String json) {
        try {
            var node = objectMapper.readTree(json == null ? "{}" : json);
            Map<String, String> fields = new java.util.LinkedHashMap<>();
            node.fields().forEachRemaining(entry -> {
                String value = entry.getValue().isTextual()
                        ? entry.getValue().asText()
                        : entry.getValue().toString();
                fields.put(entry.getKey(), value);
            });
            if (fields.isEmpty()) {
                throw ApiException.badRequest("MISSING_EXPECTED_FIELDS",
                        "expectedFields must contain at least one field to verify.");
            }
            return fields;
        } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
            throw ApiException.badRequest("INVALID_EXPECTED_FIELDS",
                    "expectedFields is not valid JSON: %s".formatted(exception.getMessage()));
        }
    }
}
