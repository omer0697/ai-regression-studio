package com.ars.api.domain.enums;

/**
 * How the worker logs into the application under test.
 * Credentials are resolved through a reference, never stored in the API.
 */
public enum AuthMethod {
    NONE,
    TEST_ACCOUNT_FORM
}
