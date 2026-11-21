export interface WorkerHttpError {
  error: {
    code: string;
    capability?: string;
    plannedPhase?: number | null;
    message: string;
  };
}

export function capabilityError(
  capability: string,
  plannedPhase: number,
  message: string,
): WorkerHttpError {
  return {
    error: {
      code: "CAPABILITY_NOT_IMPLEMENTED",
      capability,
      plannedPhase,
      message,
    },
  };
}

export function invalidJobError(message: string): WorkerHttpError {
  return {
    error: {
      code: "INVALID_JOB",
      message,
    },
  };
}
