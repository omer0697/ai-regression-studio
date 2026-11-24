package com.ars.api.controller;

import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.ars.api.domain.entity.TestExecution;
import com.ars.api.domain.repository.ArtifactRepository;
import com.ars.api.domain.repository.TestExecutionRepository;
import com.ars.api.service.ArtifactStorageService;
import com.ars.api.service.BugFindingService;
import com.ars.api.service.DependencyObservationService;
import com.ars.api.service.DiscoveredElementService;
import com.ars.api.service.ElementMappingService;
import com.ars.api.service.ExecutionEventService;
import com.ars.api.service.ExecutionProgressService;
import com.ars.api.service.PdfComparisonRunner;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = InternalExecutionController.class)
@AutoConfigureMockMvc(addFilters = false)
class InternalExecutionControllerTest {

    private static final String GWT_PDF = Base64.getEncoder()
            .encodeToString("%PDF-1.4 gwt".getBytes());
    private static final String REACT_PDF = Base64.getEncoder()
            .encodeToString("%PDF-1.4 react".getBytes());

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private TestExecutionRepository executionRepository;
    @MockitoBean
    private ExecutionEventService eventService;
    @MockitoBean
    private ExecutionProgressService progressService;
    @MockitoBean
    private DiscoveredElementService elementService;
    @MockitoBean
    private DependencyObservationService observationService;
    @MockitoBean
    private ElementMappingService mappingService;
    @MockitoBean
    private BugFindingService findingService;
    @MockitoBean
    private ArtifactRepository artifactRepository;
    @MockitoBean
    private ArtifactStorageService storageService;
    @MockitoBean
    private PdfComparisonRunner pdfComparisonRunner;

    @Test
    void pdfCheck_decodesBothDocumentsAndDelegatesToPdfBoxRunner() throws Exception {
        TestExecution execution = Mockito.mock(TestExecution.class);
        when(execution.getProjectId()).thenReturn(7L);
        when(executionRepository.findById(42L)).thenReturn(Optional.of(execution));
        when(pdfComparisonRunner.compare(
                eq(7L), eq("KPY68"), anyString(), any(byte[].class),
                anyString(), any(byte[].class), anyMap(), eq("browser-worker")))
                .thenReturn(new PdfComparisonRunner.PdfComparisonResponse(
                        5L, "MATCH", 1, 1, List.of(), 10L, 11L, Instant.now()));

        mockMvc.perform(post("/api/internal/executions/42/pdf-check")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "screenCode": "kpy68",
                                  "gwtFileName": "gwt.pdf",
                                  "gwtPdfBase64": "%s",
                                  "reactFileName": "react.pdf",
                                  "reactPdfBase64": "%s",
                                  "expectedFields": {"Ad Soyad": "Ömer Yılmaz"}
                                }
                                """.formatted(GWT_PDF, REACT_PDF)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.verdict").value("MATCH"))
                .andExpect(jsonPath("$.id").value(5));

        verify(pdfComparisonRunner).compare(
                eq(7L), eq("KPY68"), eq("gwt.pdf"), any(byte[].class),
                eq("react.pdf"), any(byte[].class), anyMap(), eq("browser-worker"));
    }

    @Test
    void pdfCheck_withInvalidBase64_returnsExplicitBadRequest() throws Exception {
        TestExecution execution = Mockito.mock(TestExecution.class);
        when(execution.getProjectId()).thenReturn(7L);
        when(executionRepository.findById(42L)).thenReturn(Optional.of(execution));

        mockMvc.perform(post("/api/internal/executions/42/pdf-check")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "gwtPdfBase64": "not-base64!!",
                                  "reactPdfBase64": "%s",
                                  "expectedFields": {"Ad Soyad": "Test"}
                                }
                                """.formatted(REACT_PDF)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PDF_PAYLOAD"));

        verify(pdfComparisonRunner, never()).compare(
                any(), anyString(), anyString(), any(byte[].class),
                anyString(), any(byte[].class), anyMap(), anyString());
    }

    @Test
    void pdfCheck_withoutExpectedFields_returnsValidationError() throws Exception {
        mockMvc.perform(post("/api/internal/executions/42/pdf-check")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "gwtPdfBase64": "%s",
                                  "reactPdfBase64": "%s",
                                  "expectedFields": {}
                                }
                                """.formatted(GWT_PDF, REACT_PDF)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors.expectedFields").exists());
    }

    @Test
    void pdfCheck_forUnknownExecution_returnsNotFound() throws Exception {
        when(executionRepository.findById(99L)).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/internal/executions/99/pdf-check")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "gwtPdfBase64": "%s",
                                  "reactPdfBase64": "%s",
                                  "expectedFields": {"Ad Soyad": "Test"}
                                }
                                """.formatted(GWT_PDF, REACT_PDF)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("EXECUTION_NOT_FOUND"));

        verify(pdfComparisonRunner, never()).compare(
                any(), anyString(), anyString(), any(byte[].class),
                anyString(), any(byte[].class), anyMap(), anyString());
    }
}
