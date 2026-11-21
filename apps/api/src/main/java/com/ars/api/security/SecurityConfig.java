package com.ars.api.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

import com.ars.api.config.AppProperties;

/**
 * Session-based security with the SPA cookie CSRF pattern:
 * the XSRF-TOKEN cookie is exposed to JavaScript (httpOnly=false) and the
 * frontend echoes it back as the X-XSRF-TOKEN header on mutations.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            RestAuthenticationEntryPoint authenticationEntryPoint,
            RestAccessDeniedHandler accessDeniedHandler,
            CorsConfigurationSource corsConfigurationSource) throws Exception {

        // Force eager CSRF token resolution so every response carries the cookie.
        CsrfTokenRequestAttributeHandler csrfRequestHandler = new CsrfTokenRequestAttributeHandler();
        csrfRequestHandler.setCsrfRequestAttributeName(null);

        // Namespace the CSRF cookie: other localhost apps commonly use the
        // default "XSRF-TOKEN" name and cookies are not port-scoped, so a
        // sibling app would silently clobber this platform's token.
        CookieCsrfTokenRepository csrfTokenRepository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrfTokenRepository.setCookieName("ARS-XSRF-TOKEN");

        http
                .csrf(csrf -> csrf
                        .csrfTokenRepository(csrfTokenRepository)
                        .csrfTokenRequestHandler(csrfRequestHandler)
                        // The worker callback channel is authenticated by the
                        // internal token filter, not by browser sessions.
                        .ignoringRequestMatchers("/api/internal/**"))
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .authorizeHttpRequests(auth -> auth
                        // Worker callback channel is guarded by the internal
                        // token filter, not by user sessions.
                        .requestMatchers("/api/internal/**").permitAll()
                        .requestMatchers("/api/auth/login", "/api/auth/me", "/api/auth/logout").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/info").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(authenticationEntryPoint)
                        .accessDeniedHandler(accessDeniedHandler))
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED));

        return http.build();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration configuration)
            throws Exception {
        return configuration.getAuthenticationManager();
    }

    /** Shared strategy for manual security-context updates (login/logout). */
    @Bean
    public org.springframework.security.core.context.SecurityContextHolderStrategy securityContextHolderStrategy() {
        return org.springframework.security.core.context.SecurityContextHolder.getContextHolderStrategy();
    }

    /**
     * Registers the internal token guard only on the callback paths; it runs
     * after the security chain (which permits /api/internal/** for sessions).
     */
    @Bean
    public org.springframework.boot.web.servlet.FilterRegistrationBean<InternalTokenFilter> internalTokenFilter(
            com.ars.api.config.AppProperties properties) {
        var registration = new org.springframework.boot.web.servlet.FilterRegistrationBean<>(
                new InternalTokenFilter(properties));
        registration.addUrlPatterns("/api/internal/*");
        registration.setOrder(org.springframework.core.Ordered.LOWEST_PRECEDENCE);
        registration.setName("internalTokenFilter");
        return registration;
    }

    /** Phase 8: per-IP rate limiting (login/AI endpoints get a tighter cap). */
    @Bean
    public org.springframework.boot.web.servlet.FilterRegistrationBean<com.ars.api.security.RateLimitFilter> rateLimitFilter() {
        var registration = new org.springframework.boot.web.servlet.FilterRegistrationBean<>(
                new com.ars.api.security.RateLimitFilter());
        registration.addUrlPatterns("/api/*");
        registration.setOrder(org.springframework.core.Ordered.HIGHEST_PRECEDENCE + 100);
        registration.setName("rateLimitFilter");
        return registration;
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource(AppProperties properties) {
        CorsConfiguration configuration = new CorsConfiguration();
        // Pattern-based list: browsers attach an Origin header to every POST
        // (same-origin included), so the dev proxy port must be allowed.
        // Default covers every localhost port; production tightens via env.
        configuration.setAllowedOriginPatterns(properties.cors().allowedOrigins());
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowCredentials(true);
        configuration.setAllowedHeaders(List.of("Content-Type", "X-XSRF-TOKEN", "Accept"));
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", configuration);
        return source;
    }
}
