package com.ars.api.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.ars.api.domain.entity.BugFinding;
import com.ars.api.domain.entity.DiscoveredElement;
import com.ars.api.domain.repository.BugFindingRepository;
import com.ars.api.domain.repository.DiscoveredElementRepository;
import com.ars.api.domain.repository.TestExecutionRepository;
import com.ars.api.dto.ExecutionView;

/**
 * Aggregated execution reports: summary, category breakdown, findings,
 * discovered coverage and honest unverified sections. Exportable as JSON and
 * as a PDFBox-generated PDF report.
 */
@Service
public class ReportService {

    private final TestExecutionRepository executionRepository;
    private final BugFindingRepository bugRepository;
    private final DiscoveredElementRepository elementRepository;
    private final PdfComparisonService pdfService;

    public ReportService(
            TestExecutionRepository executionRepository,
            BugFindingRepository bugRepository,
            DiscoveredElementRepository elementRepository,
            PdfComparisonService pdfService) {
        this.executionRepository = executionRepository;
        this.bugRepository = bugRepository;
        this.elementRepository = elementRepository;
        this.pdfService = pdfService;
    }

    public Map<String, Object> buildReport(Long executionId) {
        ExecutionView execution = executionRepository.findByIdWithNames(executionId)
                .orElseThrow(() -> new com.ars.api.web.ApiException(
                        org.springframework.http.HttpStatus.NOT_FOUND, "EXECUTION_NOT_FOUND",
                        "Execution %d does not exist.".formatted(executionId)));

        List<BugFinding> findings = bugRepository.findByExecutionIdOrderByIdAsc(executionId);
        List<DiscoveredElement> elements = elementRepository
                .findByExecutionIdOrderByElementRefAsc(executionId);

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("reportType", "AI_REGRESSION_STUDIO_REPORT");
        report.put("generatedAt", Instant.now().toString());
        report.put("execution", executionSummary(execution));

        // Category breakdown of findings.
        Map<String, Long> byCategory = new LinkedHashMap<>();
        Map<String, Long> bySeverity = new LinkedHashMap<>();
        List<Map<String, Object>> findingList = new ArrayList<>();
        for (BugFinding finding : findings) {
            byCategory.merge(finding.getCategory(), 1L, Long::sum);
            bySeverity.merge(finding.getSeverity(), 1L, Long::sum);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("bugCode", finding.getBugCode());
            item.put("category", finding.getCategory());
            item.put("severity", finding.getSeverity());
            item.put("title", finding.getTitle());
            item.put("expected", finding.getExpectedBehavior());
            item.put("actual", finding.getActualBehavior());
            item.put("status", finding.getStatus());
            findingList.add(item);
        }
        report.put("summary", Map.of(
                "totalFindings", findings.size(),
                "byCategory", byCategory,
                "bySeverity", bySeverity,
                "totalSteps", execution.totalSteps(),
                "passedSteps", execution.passedSteps(),
                "failedSteps", execution.failedSteps(),
                "skippedSteps", execution.skippedSteps()));

        // Coverage: what the discovery observed (and what stayed hidden).
        long visible = elements.stream().filter(DiscoveredElement::isVisible).count();
        long enabled = elements.stream().filter(DiscoveredElement::isEnabled).count();
        Map<String, Object> coverage = new LinkedHashMap<>();
        coverage.put("discoveredElements", elements.size());
        coverage.put("visible", visible);
        coverage.put("hidden", elements.size() - visible);
        coverage.put("enabled", enabled);
        coverage.put("disabled", elements.size() - enabled);
        report.put("coverage", coverage);

        // Honest unverified section: what this execution does NOT claim.
        List<String> unverified = new ArrayList<>();
        if (execution.status().name().equals("NOT_SUPPORTED")) {
            unverified.add("Bu çalıştırma hiçbir test sonucu üretmedi (yetenek devrede değil).");
        }
        unverified.add("Bulgular makine tarafından tespit edildi; onay süreci insan kararıdır.");
        unverified.add("Dinamik eklenen elemanlar (yükleme sonrası DOM) bu kapsam dışındadır.");
        report.put("unverified", unverified);
        report.put("findings", findingList);

        return report;
    }

    /** PDFBox-rendered Turkish report with summary + findings table. */
    public byte[] buildPdfReport(Long executionId) {
        Map<String, Object> report = buildReport(executionId);

        try (var document = new org.apache.pdfbox.pdmodel.PDDocument()) {
            var page = new org.apache.pdfbox.pdmodel.PDPage();
            document.addPage(page);
            var font = new org.apache.pdfbox.pdmodel.font.PDType1Font(
                    org.apache.pdfbox.pdmodel.font.Standard14Fonts.FontName.HELVETICA);
            var bold = new org.apache.pdfbox.pdmodel.font.PDType1Font(
                    org.apache.pdfbox.pdmodel.font.Standard14Fonts.FontName.HELVETICA_BOLD);

            try (var stream = new org.apache.pdfbox.pdmodel.PDPageContentStream(document, page)) {
                float y = 800;
                y = title(stream, y, bold, "AI Regression Studio - Test Raporu");

                @SuppressWarnings("unchecked")
                Map<String, Object> execution = (Map<String, Object>) report.get("execution");
                @SuppressWarnings("unchecked")
                Map<String, Object> summary = (Map<String, Object>) report.get("summary");
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> findings =
                        (List<Map<String, Object>>) report.get("findings");

                stream.setFont(font, 11);
                y = line(stream, y, font,
                        "Calistirma: #%s  Ekran: %s  Mod: %s  Durum: %s".formatted(
                                execution.get("id"), execution.get("screenCode"),
                                execution.get("mode"), execution.get("status")));
                Object highCount = ((Map<Object, Object>) summary.get("bySeverity"))
                        .getOrDefault("HIGH", 0L);
                y = line(stream, y, font,
                        "Bulgu sayisi: %s  (Yuksek: %s)".formatted(
                                String.valueOf(summary.get("totalFindings")),
                                String.valueOf(highCount)));
                y = line(stream, y, font,
                        "Adimlar: %s toplam, %s gecen, %s basarisiz, %s atlanan".formatted(
                                summary.get("totalSteps"), summary.get("passedSteps"),
                                summary.get("failedSteps"), summary.get("skippedSteps")));
                y -= 10;

                stream.setFont(bold, 12);
                stream.beginText();
                stream.newLineAtOffset(50, y);
                stream.showText("Bulgular");
                stream.endText();
                y -= 18;
                stream.setFont(font, 10);
                for (Map<String, Object> finding : findings) {
                    y = line(stream, y, font, "%s [%s/%s] %s".formatted(
                            finding.get("bugCode"), finding.get("severity"),
                            finding.get("category"), finding.get("title")));
                    y = line(stream, y, font, "  Beklenen: %s".formatted(finding.get("expected")));
                    y = line(stream, y, font, "  Gerceklesen: %s".formatted(finding.get("actual")));
                    y -= 6;
                }

                y -= 6;
                stream.setFont(bold, 12);
                stream.beginText();
                stream.newLineAtOffset(50, y);
                stream.showText("Dogrulanmamis Kapsam");
                stream.endText();
                y -= 18;
                stream.setFont(font, 10);
                @SuppressWarnings("unchecked")
                List<String> unverified = (List<String>) report.get("unverified");
                for (String note : unverified) {
                    y = line(stream, y, font, "- " + note);
                }
            }
            var out = new java.io.ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        } catch (Exception exception) {
            throw new com.ars.api.web.ApiException(
                    org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR,
                    "REPORT_PDF_FAILED",
                    "PDF report could not be generated: %s".formatted(exception.getMessage()));
        }
    }

    private float title(
            org.apache.pdfbox.pdmodel.PDPageContentStream stream,
            float y,
            org.apache.pdfbox.pdmodel.font.PDFont font,
            String text) throws java.io.IOException {
        stream.setFont(font, 16);
        stream.beginText();
        stream.newLineAtOffset(50, y);
        stream.showText(text);
        stream.endText();
        return y - 28;
    }

    private float line(
            org.apache.pdfbox.pdmodel.PDPageContentStream stream,
            float y,
            org.apache.pdfbox.pdmodel.font.PDFont font) throws java.io.IOException {
        return y;
    }

    private float line(
            org.apache.pdfbox.pdmodel.PDPageContentStream stream,
            float y,
            org.apache.pdfbox.pdmodel.font.PDFont font,
            String text) throws java.io.IOException {
        String normalized = text.replace('ı', 'i').replace('İ', 'I')
                .replace('ğ', 'g').replace('Ğ', 'G')
                .replace('ş', 's').replace('Ş', 'S')
                .replace("→", "->").replace("•", "-");
        stream.beginText();
        stream.newLineAtOffset(50, y);
        stream.showText(normalized);
        stream.endText();
        return y - 16;
    }

    private Map<String, Object> executionSummary(ExecutionView execution) {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("id", execution.id());
        summary.put("projectName", execution.projectName());
        summary.put("screenCode", execution.screenCode());
        summary.put("mode", execution.mode().name());
        summary.put("status", execution.status().name());
        summary.put("errorCode", execution.errorCode());
        summary.put("startedAt", execution.startedAt());
        summary.put("finishedAt", execution.finishedAt());
        return summary;
    }
}
