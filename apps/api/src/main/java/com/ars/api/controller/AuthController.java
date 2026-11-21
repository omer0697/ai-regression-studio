package com.ars.api.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ars.api.domain.entity.UserAccount;
import com.ars.api.domain.repository.UserRepository;
import com.ars.api.dto.LoginRequest;
import com.ars.api.dto.SessionResponse;
import com.ars.api.dto.SessionUserResponse;
import com.ars.api.service.AuditService;
import com.ars.api.web.ApiException;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "Auth", description = "Session login/logout and current user.")
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final SecurityContextHolderStrategy securityContextHolderStrategy;
    private final SecurityContextRepository securityContextRepository;
    private final UserRepository userRepository;
    private final AuditService auditService;

    public AuthController(
            AuthenticationManager authenticationManager,
            SecurityContextHolderStrategy securityContextHolderStrategy,
            UserRepository userRepository,
            AuditService auditService) {
        this.authenticationManager = authenticationManager;
        this.securityContextHolderStrategy = securityContextHolderStrategy;
        this.securityContextRepository = new HttpSessionSecurityContextRepository();
        this.userRepository = userRepository;
        this.auditService = auditService;
    }

    @PostMapping("/login")
    @Operation(summary = "Log in with a platform account.")
    public ResponseEntity<Void> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest,
            HttpServletResponse httpResponse) {
        try {
            Authentication authentication = authenticationManager.authenticate(
                    UsernamePasswordAuthenticationToken.unauthenticated(
                            request.username(), request.password()));

            SecurityContext context = securityContextHolderStrategy.createEmptyContext();
            context.setAuthentication(authentication);
            securityContextHolderStrategy.setContext(context);
            securityContextRepository.saveContext(context, httpRequest, httpResponse);

            userRepository.findByUsername(request.username()).ifPresent(account -> {
                account.setLastLoginAt(Instant.now());
                userRepository.save(account);
            });

            auditService.record(httpRequest, request.username(), "LOGIN_SUCCESS",
                    "USER", request.username(), null);
            return ResponseEntity.ok().build();
        } catch (AuthenticationException exception) {
            auditService.record(httpRequest, request.username(), "LOGIN_FAILURE",
                    "USER", request.username(), Map.of("reason", "invalid_credentials"));
            throw ApiException.unauthorized("INVALID_CREDENTIALS", "Invalid username or password.");
        }
    }

    @GetMapping("/me")
    @Operation(summary = "Current session; returns a null user when anonymous.")
    public SessionResponse me(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()
                || authentication.getPrincipal() instanceof String) {
            return SessionResponse.anonymous();
        }
        String username = authentication.getName();
        UserAccount account = userRepository.findByUsername(username).orElse(null);
        if (account == null) {
            return SessionResponse.anonymous();
        }
        return new SessionResponse(new SessionUserResponse(
                account.getUsername(), account.getDisplayName(), account.getRole()));
    }

    @PostMapping("/logout")
    @Operation(summary = "Invalidate the current session.")
    public ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
        Authentication authentication = securityContextHolderStrategy.getContext().getAuthentication();
        if (authentication != null && authentication.isAuthenticated()
                && authentication.getPrincipal() instanceof UserDetails details) {
            auditService.record(request, details.getUsername(), "LOGOUT", "USER",
                    details.getUsername(), null);
        }
        if (request.getSession(false) != null) {
            request.getSession(false).invalidate();
        }
        securityContextHolderStrategy.getContext().setAuthentication(null);
        return ResponseEntity.noContent().build();
    }
}
