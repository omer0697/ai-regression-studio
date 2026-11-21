package com.ars.api.domain.enums;

public enum ExecutionMode {
    /** Explore the legacy GWT screen. */
    DISCOVERY,
    /** Run equivalent scenarios in GWT and React and compare behavior. */
    COMPARISON,
    /** V8: fill every field with bounded combinations in both apps. */
    COMBINATION
}
