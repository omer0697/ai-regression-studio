package com.ars.api.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI arsOpenApi() {
        return new OpenAPI().info(new Info()
                .title("AI Regression Studio API")
                .version("0.1.0")
                .description("""
                        Orchestration API for the GWT→React regression testing platform.
                        All endpoints except /api/auth/** and actuator health require an
                        authenticated session (the Next.js app proxies calls same-origin).
                        """)
                .contact(new Contact().name("ARS Team")));
    }
}
