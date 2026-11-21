package com.ars.api.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;

import com.ars.api.service.PdfComparisonService.PdfComparisonResult;
import com.ars.api.service.PdfComparisonService.PdfContent;
import com.ars.api.service.PdfComparisonService.PdfDifference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Master prompt §23: "validate the PDF comparison module against synthetic
 * PDFs containing known missing or incorrect fields." These tests build the
 * documents with PDFBox itself — no fixtures files, no external apps.
 */
class PdfComparisonServiceTest {

    /** Labels transliterated for Helvetica/WinAnsi (same as buildPdf). */
    private static final Map<String, String> EXPECTED = Map.of(
            "Parametre Kodu", "KPY-001",
            "Parametre Tipi", "OZEL",
            "Parametre Degeri", "ABC-123",
            "Açiklama", "Standart parametre tanimi",
            "Durum", "Aktif");

    @Test
    void identicalDocuments_produceMatchVerdict() throws IOException {
        byte[] pdf = buildPdf(List.of(
                "KPY68 — Parametre Tanımları",
                "Parametre Kodu",
                "KPY-001",
                "Parametre Tipi",
                "OZEL",
                "Parametre Değeri",
                "ABC-123",
                "Açıklama",
                "Standart parametre tanımı",
                "Durum",
                "Aktif"));

        PdfComparisonService service = new PdfComparisonService();
        PdfContent a = service.extract(pdf);
        PdfContent b = service.extract(pdf);
        PdfComparisonResult result = service.compare(a, b, EXPECTED);

        assertThat(result.verdict()).isEqualTo("MATCH");
        assertThat(result.differences()).isEmpty();
        assertThat(result.pagesA()).isEqualTo(1);
    }

    @Test
    void missingField_andIncorrectField_areDetected() throws IOException {
        byte[] reference = buildPdf(List.of(
                "KPY68 — Parametre Tanımları",
                "Parametre Kodu",
                "KPY-001",
                "Parametre Tipi",
                "OZEL",
                "Parametre Değeri",
                "ABC-123",
                "Açıklama",
                "Standart parametre tanımı",
                "Durum",
                "Aktif"));

        // React-like document with TWO injected defects (master prompt §10):
        // missing "Açıklama" and wrong "Parametre Değeri".
        byte[] defective = buildPdf(List.of(
                "KPY68 — Parametre Tanımları",
                "Parametre Kodu",
                "KPY-001",
                "Parametre Tipi",
                "OZEL",
                "Parametre Değeri",
                "",
                "Durum",
                "Pasif"));

        PdfComparisonService service = new PdfComparisonService();
        PdfComparisonResult result =
                service.compare(service.extract(reference), service.extract(defective), EXPECTED);

        assertThat(result.verdict()).isEqualTo("DIFFERENT");

        List<String> kinds = result.differences().stream().map(PdfDifference::kind).toList();
        assertThat(kinds).contains("MISSING_FIELD");
        assertThat(kinds).contains("VALUE_MISMATCH");

        var missing = result.differences().stream()
                .filter(difference -> difference.kind().equals("MISSING_FIELD"))
                .findFirst().orElseThrow();
        assertThat(missing.field()).isEqualTo("Açiklama");

        var wrongValue = result.differences().stream()
                .filter(difference -> difference.field().equals("Parametre Degeri"))
                .findFirst().orElseThrow();
        assertThat(wrongValue.kind()).isEqualTo("VALUE_MISMATCH");
        assertThat(wrongValue.expected()).isEqualTo("ABC-123");
        assertThat(wrongValue.page()).isEqualTo(1);

        var wrongStatus = result.differences().stream()
                .filter(difference -> difference.field().equals("Durum"))
                .findFirst().orElseThrow();
        assertThat(wrongStatus.actual()).isEqualTo("Pasif");
    }

    @Test
    void pageCountDifference_isDetected() throws IOException {
        byte[] onePage = buildPdf(List.of("Baslik", "Deger"));
        byte[] twoPages = buildTwoPagePdf();

        PdfComparisonService service = new PdfComparisonService();
        PdfComparisonResult result = service.compare(
                service.extract(onePage),
                service.extract(twoPages),
                Map.of("Baslik", "Deger"));

        assertThat(result.differences())
                .anySatisfy(difference -> {
                    assertThat(difference.kind()).isEqualTo("PAGE_COUNT");
                    assertThat(difference.expected()).isEqualTo("1");
                    assertThat(difference.actual()).isEqualTo("2");
                });
    }

    @Test
    void dynamicTimestamps_areNormalizedNotReported() throws IOException {
        PdfComparisonService service = new PdfComparisonService();
        byte[] withTimestamp = buildPdf(List.of(
                "Rapor",
                "21.11.2026 14:30",
                "Durum",
                "Aktif"));
        byte[] withOtherTimestamp = buildPdf(List.of(
                "Rapor",
                "05.12.2026 09:15",
                "Durum",
                "Aktif"));

        PdfComparisonResult result = service.compare(
                service.extract(withTimestamp),
                service.extract(withOtherTimestamp),
                Map.of("Durum", "Aktif"));

        // Only fields in the expected map are compared; the differing
        // timestamp line must not leak into any difference.
        assertThat(result.verdict()).isEqualTo("MATCH");
    }

    /** Builds a single-page PDF with one line per list entry. */
    private byte[] buildPdf(List<String> lines) throws IOException {
        return buildPdf(lines, null);
    }

    /** Lines after `pageBreakMarker` go to a second page. */
    private byte[] buildPdf(List<String> lines, String pageBreakMarker) throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage();
            document.addPage(page);
            PDPage secondPage = null;
            try (PDPageContentStream stream = new PDPageContentStream(document, page)) {
                stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 11);
                float y = 750;
                for (String rawLine : lines) {
                    if (pageBreakMarker != null && rawLine.equals(pageBreakMarker)) {
                        secondPage = new PDPage();
                        document.addPage(secondPage);
                        break;
                    }
                    stream.beginText();
                    stream.newLineAtOffset(50, y);
                    stream.showText(toWinAnsi(rawLine));
                    stream.endText();
                    y -= 18;
                }
            }
            if (secondPage != null) {
                try (PDPageContentStream stream =
                        new PDPageContentStream(document, secondPage)) {
                    stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 11);
                    stream.beginText();
                    stream.newLineAtOffset(50, 750);
                    stream.showText(toWinAnsi(pageBreakMarker));
                    stream.endText();
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }

    /** Helvetica/WinAnsi cannot encode some Turkish glyphs — keep text ASCII-safe. */
    private static String toWinAnsi(String text) {
        return text.replace('ı', 'i').replace('İ', 'I')
                .replace('ğ', 'g').replace('Ğ', 'G')
                .replace('ş', 's').replace('Ş', 'S');
    }

    private byte[] buildTwoPagePdf() throws IOException {
        try (PDDocument document = new PDDocument()) {
            for (int page = 0; page < 2; page++) {
                PDPage pdPage = new PDPage();
                document.addPage(pdPage);
                try (PDPageContentStream stream = new PDPageContentStream(document, pdPage)) {
                    stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 11);
                    stream.beginText();
                    stream.newLineAtOffset(50, 750);
                    if (page == 0) {
                        stream.showText("Baslik");
                    } else {
                        stream.showText("Ek sayfa");
                    }
                    stream.endText();
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }
}
