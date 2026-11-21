package com.ars.api.security;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.stereotype.Component;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;

/**
 * Simple in-memory per-IP rate limiter (Phase 8 hardening). Login and AI
 * endpoints get a lower budget so brute-force attempts are throttled; other
 * endpoints allow normal dashboard polling. Production deployments should
 * move this to a shared store and tune via ARS_RATE_LIMIT_* variables.
 */
@Component
public class RateLimitFilter extends jakarta.servlet.http.HttpFilter {

    private static final int DEFAULT_LIMIT_PER_MINUTE = 600;
    private static final int SENSITIVE_LIMIT_PER_MINUTE = 30;

    private final Map<String, TokenBucket> buckets = new ConcurrentHashMap<>();

    @Override
    protected void doFilter(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws IOException, ServletException {

        String path = request.getRequestURI();
        boolean sensitive = path.endsWith("/auth/login") || path.contains("/ai/plan")
                || path.contains("/ai/analyze");
        int limit = sensitive
                ? envInt("ARS_RATE_LIMIT_SENSITIVE", SENSITIVE_LIMIT_PER_MINUTE)
                : envInt("ARS_RATE_LIMIT_DEFAULT", DEFAULT_LIMIT_PER_MINUTE);

        String ip = clientIp(request);
        TokenBucket bucket = buckets.computeIfAbsent(ip + ":" + sensitive,
                key -> new TokenBucket(limit));

        if (!bucket.tryConsume()) {
            response.setStatus(429);
            response.setContentType("application/json");
            response.getWriter().write(
                    "{\"code\":\"RATE_LIMITED\",\"message\":\"Too many requests; slow down.\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    public String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].strip();
        }
        return request.getRemoteAddr();
    }

    protected int envInt(String name, int fallback) {
        String raw = System.getenv(name);
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        try {
            return Integer.parseInt(raw.trim());
        } catch (NumberFormatException exception) {
            return fallback;
        }
    }

    /** Fixed-window refill: capacity tokens per rolling 60s window. */
    private static final class TokenBucket {

        private final int capacity;
        private final AtomicLong used = new AtomicLong();
        private volatile long windowStart = System.currentTimeMillis();

        private TokenBucket(int capacity) {
            this.capacity = capacity;
        }

        private boolean tryConsume() {
            synchronized (this) {
                long now = System.currentTimeMillis();
                if (now - windowStart >= 60_000) {
                    windowStart = now;
                    used.set(0);
                }
                if (used.get() < capacity) {
                    used.incrementAndGet();
                    return true;
                }
                return false;
            }
        }
    }
}
