package com.ars.api.config;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;

import org.hibernate.HibernateException;
import org.hibernate.type.SqlTypes;
import org.hibernate.type.descriptor.WrapperOptions;
import org.hibernate.type.descriptor.java.JavaType;
import org.hibernate.type.descriptor.jdbc.BasicBinder;
import org.hibernate.type.descriptor.jdbc.BasicExtractor;
import org.hibernate.type.descriptor.jdbc.JdbcType;
import org.hibernate.type.descriptor.jdbc.JdbcTypeIndicators;
import org.hibernate.type.descriptor.jdbc.VarcharJdbcType;

/**
 * Round-trip-safe timestamp handling for the embedded SQLite profile.
 *
 * <p>The community SQLiteDialect (6.6.x) writes {@code Instant} values as
 * epoch-millis text while reads go through the driver's
 * {@code ResultSet.getTimestamp}, which cannot parse that format — resulting
 * in "Error parsing time stamp" on the first read. This type makes both
 * directions explicit: values are stored as ISO-8601 text
 * ({@code 2026-11-21T18:18:51.123Z}) via {@code setString}, and read back
 * via {@code getString} with a defensive parser that also accepts
 * epoch-millis and legacy SQL-format strings from databases written by
 * earlier boots.</p>
 *
 * <p>ISO-8601 strings keep chronological order under SQLite's TEXT
 * ordering, so {@code ORDER BY created_at} keeps working.</p>
 */
public class SqliteIsoTextTimestampJdbcType extends VarcharJdbcType {

    public static final SqliteIsoTextTimestampJdbcType INSTANCE =
            new SqliteIsoTextTimestampJdbcType();

    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_INSTANT;

    @Override
    public int getDefaultSqlTypeCode() {
        return SqlTypes.TIMESTAMP;
    }

    /** Keep temporal mappings pinned to this type during resolution. */
    @Override
    public JdbcType resolveIndicatedType(JdbcTypeIndicators indicators, JavaType<?> domainJavaType) {
        return this;
    }

    @Override
    public <X> BasicBinder<X> getBinder(final JavaType<X> javaType) {
        return new BasicBinder<>(javaType, this) {
            @Override
            protected void doBind(PreparedStatement st, X value, int index, WrapperOptions options)
                    throws SQLException {
                bindInstant(st, toInstant(value, javaType, options), index);
            }

            @Override
            protected void doBind(CallableStatement st, X value, String name, WrapperOptions options)
                    throws SQLException {
                bindInstant(st, toInstant(value, javaType, options), name);
            }
        };
    }

    @Override
    public <X> BasicExtractor<X> getExtractor(final JavaType<X> javaType) {
        return new BasicExtractor<>(javaType, this) {
            @Override
            protected X doExtract(ResultSet rs, int paramIndex, WrapperOptions options)
                    throws SQLException {
                return coerce(javaType, parse(rs.getString(paramIndex)));
            }

            @Override
            protected X doExtract(CallableStatement statement, int paramIndex, WrapperOptions options)
                    throws SQLException {
                return coerce(javaType, parse(statement.getString(paramIndex)));
            }

            @Override
            protected X doExtract(CallableStatement statement, String name, WrapperOptions options)
                    throws SQLException {
                return coerce(javaType, parse(statement.getString(name)));
            }
        };
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    private static Instant toInstant(Object value, JavaType<?> javaType, WrapperOptions options) {
        if (value == null) {
            return null;
        }
        @SuppressWarnings("unchecked")
        JavaType<Object> type = (JavaType<Object>) javaType;
        return type.unwrap(value, Instant.class, options);
    }

    private void bindInstant(PreparedStatement st, Instant instant, int index) throws SQLException {
        if (instant == null) {
            st.setNull(index, java.sql.Types.VARCHAR);
        } else {
            st.setString(index, ISO.format(instant));
        }
    }

    private void bindInstant(CallableStatement st, Instant instant, String name) throws SQLException {
        if (instant == null) {
            st.setNull(name, java.sql.Types.VARCHAR);
        } else {
            st.setString(name, ISO.format(instant));
        }
    }

    /**
     * Converts the parsed instant into the mapped property type. Every
     * temporal field in this application is {@code Instant}; other temporal
     * types fall back to Hibernate's {@code JavaType.wrap}.
     */
    @SuppressWarnings("unchecked")
    private static <X> X coerce(JavaType<X> javaType, Instant instant) {
        if (instant == null) {
            return null;
        }
        if (Instant.class.equals(javaType.getJavaTypeClass())) {
            return (X) instant;
        }
        return javaType.wrap(instant, null);
    }

    /** ISO-8601 first; falls back to epoch-millis and SQL-format strings. */
    private static Instant parse(String stored) {
        if (stored == null || stored.isBlank()) {
            return null;
        }
        String value = stored.trim();
        try {
            return Instant.parse(value);
        } catch (DateTimeParseException ignored) {
            // fall through
        }
        try {
            return Instant.ofEpochMilli(Long.parseLong(value));
        } catch (NumberFormatException ignored) {
            // fall through
        }
        try {
            return Timestamp.valueOf(value).toInstant();
        } catch (IllegalArgumentException ignored) {
            // fall through
        }
        throw new HibernateException(
                "Unparseable timestamp stored in SQLite: '%s'".formatted(stored));
    }

    @Override
    public String toString() {
        return "SqliteIsoTextTimestampJdbcType";
    }
}
