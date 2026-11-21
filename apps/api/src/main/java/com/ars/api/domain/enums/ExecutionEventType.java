package com.ars.api.domain.enums;

/** Event types recorded on the execution timeline and streamed over SSE. */
public enum ExecutionEventType {
    INFO,
    STEP,
    WARNING,
    ERROR,
    RESULT
}
