package com.ars.api.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/** Phase 8 hardening: the rate limiter throttles before requests hit the app. */
class RateLimitFilterTest {

    @Test
    void sensitiveEndpointsAreThrottledAfterTheConfiguredBudget() throws Exception {
        RateLimitFilter filter = new RateLimitFilter() {
            @Override
            public String clientIp(jakarta.servlet.http.HttpServletRequest request) {
                return "10.0.0.1";
            }

            @Override
            protected int envInt(String name, int fallback) {
                return 3; // small budget for the test
            }
        };

        MockHttpServletRequest login = new MockHttpServletRequest("POST", "/api/auth/login");
        login.setRemoteAddr("10.0.0.1");

        for (int i = 0; i < 3; i++) {
            MockHttpServletResponse response = new MockHttpServletResponse();
            filter.doFilter(login, response, new MockFilterChain());
            assertThat(response.getStatus()).isEqualTo(200);
        }

        MockHttpServletResponse blocked = new MockHttpServletResponse();
        filter.doFilter(login, blocked, new MockFilterChain());
        assertThat(blocked.getStatus()).isEqualTo(429);
        assertThat(blocked.getContentAsString()).contains("RATE_LIMITED");
    }
}
