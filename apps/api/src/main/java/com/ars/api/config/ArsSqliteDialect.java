package com.ars.api.config;

import org.hibernate.boot.model.TypeContributions;
import org.hibernate.community.dialect.SQLiteDialect;
import org.hibernate.service.ServiceRegistry;
import org.hibernate.type.SqlTypes;

/**
 * SQLite dialect used by the embedded local profile
 * ({@code SPRING_PROFILES_ACTIVE=sqlite}).
 *
 * <p>Extends the Hibernate community dialect with the mappings this
 * application additionally needs:</p>
 * <ul>
 *   <li>{@code @JdbcTypeCode(SqlTypes.JSON)} columns — stored as plain
 *       {@code text}; the schema-owned Flyway script for SQLite declares
 *       them as TEXT and Jackson serializes on the Java side.</li>
 *   <li>Temporal columns — {@link SqliteIsoTextTimestampJdbcType} replaces the
 *       community dialect's inconsistent epoch-millis write / JDBC
 *       {@code getTimestamp} read pair (which fails with "Error parsing
 *       time stamp" on the very first read of an {@code Instant}).</li>
 * </ul>
 */
public class ArsSqliteDialect extends SQLiteDialect {

    private static final SqliteIsoTextTimestampJdbcType ISO_TIMESTAMP =
            SqliteIsoTextTimestampJdbcType.INSTANCE;

    @Override
    protected String columnType(int sqlTypeCode) {
        if (sqlTypeCode == SqlTypes.JSON) {
            return "text";
        }
        return super.columnType(sqlTypeCode);
    }

    @Override
    public void contributeTypes(TypeContributions typeContributions, ServiceRegistry serviceRegistry) {
        super.contributeTypes(typeContributions, serviceRegistry);
        var registry = typeContributions.getTypeConfiguration().getJdbcTypeRegistry();
        // Every temporal SQL type code resolves to the round-trip-safe type.
        registry.addDescriptor(SqlTypes.TIMESTAMP, ISO_TIMESTAMP);
        registry.addDescriptor(SqlTypes.TIMESTAMP_WITH_TIMEZONE, ISO_TIMESTAMP);
        registry.addDescriptor(SqlTypes.TIMESTAMP_UTC, ISO_TIMESTAMP);
    }
}
