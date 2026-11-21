package com.ars.api.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import com.ars.api.domain.entity.UserAccount;
import com.ars.api.domain.enums.UserRole;
import com.ars.api.domain.repository.UserRepository;

/**
 * Seeds the initial administrator account on first boot only.
 * The password comes from ARS_SEED_ADMIN_PASSWORD and must be changed
 * (or seeding disabled) before any shared environment deployment.
 */
@Component
public class InitialUsersSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(InitialUsersSeeder.class);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AppProperties properties;

    public InitialUsersSeeder(
            UserRepository userRepository, PasswordEncoder passwordEncoder, AppProperties properties) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.properties = properties;
    }

    @Override
    public void run(ApplicationArguments args) {
        String username = properties.seed().adminUsername();
        if (userRepository.existsByUsername(username)) {
            return;
        }
        UserAccount admin = new UserAccount(
                username,
                passwordEncoder.encode(properties.seed().adminPassword()),
                "Studio Administrator",
                UserRole.ADMIN);
        userRepository.save(admin);
        log.warn("Seeded initial administrator account '{}'. "
                + "Set a strong ARS_SEED_ADMIN_PASSWORD before deploying beyond a local machine.",
                username);
    }
}
