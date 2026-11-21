package com.ars.api.security;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import org.springframework.web.filter.OncePerRequestFilter;

import com.ars.api.config.AppProperties;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Guards the worker -> API callback channel (/api/internal/**). The shared
 * secret is compared in constant time; when no token is configured the
 * endpoints are closed entirely.
 */
public class InternalTokenFilter extends OncePerRequestFilter {

    public static final String TOKEN_HEADER = "X-ARS-Internal-Token";

    private final AppProperties properties;

    public InternalTokenFilter(AppProperties properties) {
        this.properties = properties;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        if (!properties.internal().enabled()) {
            response.sendError(HttpServletResponse.SC_NOT_FOUND);
            return;
        }

        String provided = request.getHeader(TOKEN_HEADER);
        String expected = properties.internal().token();
        boolean valid = provided != null
                && MessageDigest.isEqual(
                        provided.getBytes(StandardCharsets.UTF_8),
                        expected.getBytes(StandardCharsets.UTF_8));
        if (!valid) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.getWriter()
                    .write("{\"code\":\"INVALID_INTERNAL_TOKEN\",\"message\":\"Callback token is missing or invalid.\"}");
            return;
        }

        filterChain.doFilter(request, response);
    }
}
