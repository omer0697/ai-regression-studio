package com.ars.api.controller;

import java.util.Map;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ars.api.service.ReportService;

import io.swagger.v3.oas.annotations.tags.Tag;

/** Phase 7: report generation and export (JSON + PDF). */
@RestController
@RequestMapping("/api")
@Tag(name = "Reports", description = "Execution reports with JSON and PDF export.")
public class ReportController {

    private final ReportService reportService;

    public ReportController(ReportService reportService) {
        this.reportService = reportService;
    }

    @GetMapping("/executions/{id}/report")
    public Map<String, Object> report(@PathVariable Long id) {
        return reportService.buildReport(id);
    }

    @GetMapping("/executions/{id}/report.pdf")
    public ResponseEntity<byte[]> reportPdf(@PathVariable Long id) {
        byte[] pdf = reportService.buildPdfReport(id);
        return ResponseEntity.status(HttpStatus.OK)
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_PDF_VALUE)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\"ars-report-%d.pdf\"".formatted(id))
                .body(pdf);
    }
}
