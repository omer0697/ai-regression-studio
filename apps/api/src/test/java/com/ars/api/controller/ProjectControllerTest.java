package com.ars.api.controller;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.ars.api.dto.ProjectResponse;
import com.ars.api.service.ProjectService;
import com.ars.api.web.ApiException;

import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = ProjectController.class)
@AutoConfigureMockMvc(addFilters = false)
class ProjectControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ProjectService projectService;

    @Test
    void createProject_withInvalidBody_returnsValidationErrors() throws Exception {
        mockMvc.perform(post("/api/projects")
                        .with(user("tester").roles("TESTER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors.name").exists())
                .andExpect(jsonPath("$.fieldErrors.environmentName").exists());
    }

    @Test
    void createProject_withValidBody_returnsCreated() throws Exception {
        when(projectService.create(ArgumentMatchers.any(), ArgumentMatchers.any()))
                .thenReturn(new ProjectResponse(
                        7L, "KAP Migration", null, "TEST", true, Instant.now(),
                        0, 0, 0, List.of(), List.of()));

        mockMvc.perform(post("/api/projects")
                        .with(user("tester").roles("TESTER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name": "KAP Migration", "environmentName": "TEST"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(7))
                .andExpect(jsonPath("$.name").value("KAP Migration"))
                .andExpect(jsonPath("$.environmentName").value("TEST"));
    }

    @Test
    void createProject_withDuplicateName_returnsConflict() throws Exception {
        when(projectService.create(ArgumentMatchers.any(), ArgumentMatchers.any()))
                .thenThrow(ApiException.conflict("PROJECT_NAME_EXISTS",
                        "A project with this name already exists."));

        mockMvc.perform(post("/api/projects")
                        .with(user("tester").roles("TESTER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name": "KAP Migration", "environmentName": "TEST"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PROJECT_NAME_EXISTS"));
    }

    @Test
    void getProject_unknownId_returnsNotFound() throws Exception {
        when(projectService.get(42L))
                .thenThrow(ApiException.notFound("PROJECT_NOT_FOUND", "No such project."));

        mockMvc.perform(get("/api/projects/42").with(user("tester").roles("TESTER")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PROJECT_NOT_FOUND"));
    }
}
