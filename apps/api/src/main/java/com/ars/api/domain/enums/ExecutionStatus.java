package com.ars.api.domain.enums;

/**
 * Execution lifecycle. NOT_SUPPORTED is an honest terminal state used when the
 * platform cannot perform an execution yet — it never masquerades as success.
 */
public enum ExecutionStatus {
    CREATED,
    QUEUED,
    RUNNING,
    COMPLETED,
    FAILED,
    NOT_SUPPORTED,
    ERROR,
    CANCELLED;

    public boolean isTerminal() {
        return this == COMPLETED || this == FAILED || this == NOT_SUPPORTED
                || this == ERROR || this == CANCELLED;
    }
}
