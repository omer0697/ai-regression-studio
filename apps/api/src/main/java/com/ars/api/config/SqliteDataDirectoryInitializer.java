package com.ars.api.config;

import java.nio.file.Files;
import java.nio.file.Path;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.env.ConfigurableEnvironment;

/**
 * Creates the parent directory of a file-based SQLite database before any
 * component tries to open it (the JDBC driver creates the file, not the
 * folder). Runs early in boot, after config data — including the
 * {@code sqlite} profile — has been loaded.
 *
 * <p>Example: {@code jdbc:sqlite:./data/ars.sqlite} ensures {@code ./data}
 * exists before Flyway connects.</p>
 */
public class SqliteDataDirectoryInitializer implements EnvironmentPostProcessor {

    private static final String PREFIX = "jdbc:sqlite:";

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        String url = environment.getProperty("spring.datasource.url", "");
        if (url == null || !url.startsWith(PREFIX)) {
            return;
        }
        String path = url.substring(PREFIX.length());
        int query = path.indexOf('?');
        if (query >= 0) {
            path = path.substring(0, query);
        }
        if (path.startsWith("file:")) {
            path = path.substring("file:".length());
        }
        if (path.isBlank() || ":memory:".equals(path)) {
            return;
        }
        try {
            Path parent = Path.of(path).toAbsolutePath().normalize().getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
        } catch (Exception exception) {
            // Boot will surface the real SQLITE_CANTOPEN error if the
            // directory cannot be created; do not fail earlier with a
            // less informative stack trace.
        }
    }
}
