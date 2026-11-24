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
import com.ars.api.domain.entity.RequirementDefinition;
import com.ars.api.domain.repository.BugFindingRepository;
import com.ars.api.domain.repository.DiscoveredElementRepository;
import com.ars.api.domain.repository.RequirementDefinitionRepository;
import com.ars.api.domain.repository.TestExecutionRepository;
import com.ars.api.dto.ExecutionView;

/**
 * Aggregated execution reports: summary, category breakdown, findings,
 * discovered coverage and honest unverified sections. Exportable as JSON,
 * Markdown (.md) bug explanation document, and a PDFBox-generated PDF report.
 */
@Service
public class ReportService {

    private final TestExecutionRepository executionRepository;
    private final BugFindingRepository bugRepository;
    private final DiscoveredElementRepository elementRepository;
    private final RequirementDefinitionRepository requirementRepository;
    private final PdfComparisonService pdfService;

    public ReportService(
            TestExecutionRepository executionRepository,
            BugFindingRepository bugRepository,
            DiscoveredElementRepository elementRepository,
            RequirementDefinitionRepository requirementRepository,
            PdfComparisonService pdfService) {
        this.executionRepository = executionRepository;
        this.bugRepository = bugRepository;
        this.elementRepository = elementRepository;
        this.requirementRepository = requirementRepository;
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

    /**
     * Generates a developer-ready Markdown (.md) report explaining every detected
     * GWT <-> React regression, missing PDF field, workflow (Send to Sign / Publish)
     * discrepancy, and Confluence requirement coverage. Also writes a copy to
     * data/reports/BUG-REPORT-<screenCode>-exec-<id>.md.
     */
    public String buildMarkdownReport(Long executionId) {
        ExecutionView execution = executionRepository.findByIdWithNames(executionId)
                .orElseThrow(() -> new com.ars.api.web.ApiException(
                        org.springframework.http.HttpStatus.NOT_FOUND, "EXECUTION_NOT_FOUND",
                        "Execution %d does not exist.".formatted(executionId)));

        List<BugFinding> findings = bugRepository.findByExecutionIdOrderByIdAsc(executionId);
        List<DiscoveredElement> elements = elementRepository
                .findByExecutionIdOrderByElementRefAsc(executionId);
        List<RequirementDefinition> requirements = requirementRepository
                .findByProjectIdAndScreenCodeOrderByIdAsc(execution.projectId(), execution.screenCode());

        StringBuilder md = new StringBuilder();
        md.append("# GWT ↔ React Dönüşüm Test & Hata Açıklama Raporu (").append(execution.screenCode()).append(")\n\n");
        md.append("- **Çalıştırma No:** `#").append(execution.id()).append("`\n");
        md.append("- **Proje:** ").append(execution.projectName()).append("\n");
        md.append("- **Ekran:** `").append(execution.screenCode()).append("` — ").append(execution.screenName()).append("\n");
        md.append("- **Test Modu:** `").append(execution.mode().name()).append("`\n");
        md.append("- **Durum:** `").append(execution.status().name()).append("`\n");
        md.append("- **Rapor Tarihi:** ").append(Instant.now().toString()).append("\n\n");

        md.append("## 1. Yürütme Özeti\n\n");
        md.append("| Metrik | Değer |\n");
        md.append("| --- | --- |\n");
        md.append("| Keşfedilen Ekran / Iframe Elemanı | ").append(elements.size()).append(" |\n");
        md.append("| Toplam Test Adımı | ").append(execution.totalSteps()).append(" |\n");
        md.append("| Başarılı Adım | ").append(execution.passedSteps()).append(" |\n");
        md.append("| Tespit Edilen Fark / Hata Sayısı | **").append(findings.size()).append("** |\n\n");

        md.append("## 2. Tespit Edilen Hatalar ve Detaylı Açıklamaları\n\n");
        if (findings.isEmpty()) {
            md.append("> Bu çalıştırmada GWT ile React ekranları arasında davranışsal fark tespit edilmedi.\n\n");
        } else {
            for (BugFinding finding : findings) {
                md.append("### ").append(finding.getBugCode()).append(" — ").append(finding.getTitle()).append("\n\n");
                md.append("- **Önem Derecesi:** `").append(finding.getSeverity()).append("`\n");
                md.append("- **Kategori:** `").append(finding.getCategory()).append("`\n");
                md.append("- **Eski (GWT) Beklenen Davranış:** ").append(finding.getExpectedBehavior() == null ? "—" : finding.getExpectedBehavior()).append("\n");
                md.append("- **Yeni (React) Gerçekleşen Davranış:** ").append(finding.getActualBehavior() == null ? "—" : finding.getActualBehavior()).append("\n");
                md.append("- **Hata Açıklaması & Çözüm Önerisi:** ").append(explainFindingInTurkish(finding)).append("\n");
                if (finding.getAiHypothesis() != null && !finding.getAiHypothesis().isBlank()) {
                    md.append("- **Local LLM (AI) Kök Neden Analizi:** ").append(finding.getAiHypothesis()).append("\n");
                }
                md.append("\n");
            }
        }

        md.append("## 3. Confluence Yeni Geliştirme & Gereksinim Karşılaştırması\n\n");
        if (requirements.isEmpty()) {
            md.append("_Bu ekran için henüz Confluence yeni geliştirme veya gereksinim maddesi senkronize edilmedi._\n\n");
        } else {
            md.append("| Durum | Confluence / Gereksinim Maddesi | Eşleşen Ekran Elemanları |\n");
            md.append("| --- | --- | --- |\n");
            for (RequirementDefinition req : requirements) {
                Object matched = req.getCoverage() != null ? req.getCoverage().get("matchedElements") : null;
                String statusBadge = "VERIFIED".equals(req.getStatus())
                        ? "DOĞRULANDI (Ekranda Mevcut)"
                        : "EKSİK / İNCELEME GEREKLİ (Ekranda Bulunamadı)";
                md.append("| **").append(statusBadge).append("** | ")
                        .append(req.getTitle().replace("|", "\\|")).append(" | ")
                        .append(matched != null ? matched.toString() : "Eşleşme yok").append(" |\n");
            }
            md.append("\n");
        }

        md.append("## 4. Keşfedilen Ekran ve Iframe Elemanları\n\n");
        md.append("| Ref | Etiket | Tip | Değer | Etkin | Görünür | Konum |\n");
        md.append("| --- | --- | --- | --- | --- | --- | --- |\n");
        for (DiscoveredElement el : elements) {
            String loc = (el.getDomPath() != null && el.getDomPath().startsWith("[iframe:"))
                    ? el.getDomPath().substring(0, el.getDomPath().indexOf(']') + 1)
                    : "Ana DOM";
            md.append("| `").append(el.getElementRef()).append("` | ")
                    .append(el.getLabel() == null ? "—" : el.getLabel().replace("|", "\\|")).append(" | ")
                    .append(el.getElementType()).append(" | ")
                    .append(el.getCurrentValue() == null ? "—" : el.getCurrentValue().replace("|", "\\|")).append(" | ")
                    .append(el.isEnabled() ? "Evet" : "Hayır").append(" | ")
                    .append(el.isVisible() ? "Evet" : "Hayır").append(" | ")
                    .append(loc).append(" |\n");
        }

        String markdownText = md.toString();
        try {
            java.nio.file.Path reportsDir = java.nio.file.Paths.get("data", "reports");
            java.nio.file.Files.createDirectories(reportsDir);
            java.nio.file.Path reportFile = reportsDir.resolve(
                    "BUG-REPORT-%s-exec-%d.md".formatted(execution.screenCode(), execution.id()));
            java.nio.file.Files.writeString(reportFile, markdownText, java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception ignored) {
            // Non-fatal if filesystem write fails
        }
        return markdownText;
    }

    private String explainFindingInTurkish(BugFinding finding) {
        String title = finding.getTitle() == null ? "" : finding.getTitle();
        if (title.contains("PDF")) {
            return "Formda doldurulan alan GWT tarafında üretilen PDF belgesine yansırken, React tarafındaki PDF şablonunda/servisinde eksik bırakılmıştır. React PDF üretim payload'una bu form alanı eklenmelidir.";
        }
        if (title.contains("İmzaya Gönder") || title.contains("Yayınla")) {
            return "Belge iş akışı (İmzaya Gönder / Yayınla) GWT ekranında belgeyi e-İmza/yayın kuyruğuna geçirirken, React ekranında durum geçişi veya servis bağlantısı eksik/hatalı çalışmaktadır.";
        }
        return switch (finding.getCategory()) {
            case "FIELD_MISSING" ->
                "GWT ekranında bulunan (veya belirli bir seçim yapıldığında dinamik açılan) bu form alanı React dönüşümünde ekrana eklenmemiş ya da etiket/koşullu render kuralı unutulmuştur.";
            case "DEPENDENCY_MISMATCH" ->
                "GWT ekranında bir kontrol (select/checkbox/radio) değiştirildiğinde bağımlı alanı otomatik etkinleştirme/pasifleştirme veya değer doldurma kuralı çalışırken, React ekranında ilgili onChange / state bağımlılığı uygulanmamıştır.";
            case "VALUE_MISMATCH" ->
                "Ekran ilk açıldığında veya işlem sonrasında GWT'de gelen varsayılan/API değeri React form state'ine (initialValues / defaultValue) bağlanmamıştır.";
            case "TABLE_MISMATCH" ->
                "Veri tablosundaki satır/hücre değerleri veya kolon yapısı GWT ile React arasında farklılık göstermektedir.";
            default ->
                "Alan etkinlik (disabled) veya görünürlük (visible) durumu GWT referans ekranıyla uyuşmamaktadır.";
        };
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
