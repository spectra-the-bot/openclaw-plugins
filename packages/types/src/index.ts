/**
 * @spectratools/native-scheduler-types
 *
 * Input/output contract for scripts executed by the native-scheduler wrapper.
 * Scripts receive NativeSchedulerRunContext as JSON on stdin and may emit
 * NativeSchedulerResult as JSON on stdout.
 */

// ── Input: piped to script stdin ──────────────────────────────────────

export interface NativeSchedulerRunContext {
  schemaVersion: 1;
  runId: string;
  jobId: string;
  namespace: string;
  triggeredAt: number; // UTC epoch milliseconds
  platform: string;
  backend: string;
  config: Record<string, unknown>;
}

// ── Output: parsed from script stdout ─────────────────────────────────

export type NativeSchedulerNoopResult = { result: "noop" };
export type NativeSchedulerPromptResult = {
  result: "prompt";
  text: string;
  session?: string;
};
export type NativeSchedulerMessageResult = {
  result: "message";
  text: string;
  channel: string;
  target?: string;
};

export type NativeSchedulerResult =
  | NativeSchedulerNoopResult
  | NativeSchedulerPromptResult
  | NativeSchedulerMessageResult;

// ── Validation helpers ────────────────────────────────────────────────

const VALID_RESULT_TYPES = new Set(["noop", "prompt", "message"]);

/**
 * Type guard: is the value a valid NativeSchedulerRunContext?
 */
export function isRunContext(value: unknown): value is NativeSchedulerRunContext {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.schemaVersion === 1 &&
    typeof obj.runId === "string" &&
    typeof obj.jobId === "string" &&
    typeof obj.namespace === "string" &&
    typeof obj.triggeredAt === "number" &&
    Number.isFinite(obj.triggeredAt) &&
    typeof obj.platform === "string" &&
    typeof obj.backend === "string" &&
    typeof obj.config === "object" &&
    obj.config !== null &&
    !Array.isArray(obj.config)
  );
}

/**
 * Type guard: is the value a valid NativeSchedulerResult?
 */
export function isResult(value: unknown): value is NativeSchedulerResult {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.result !== "string" || !VALID_RESULT_TYPES.has(obj.result)) return false;

  switch (obj.result) {
    case "noop":
      return true;
    case "prompt":
      return (
        typeof obj.text === "string" &&
        (obj.session === undefined || typeof obj.session === "string")
      );
    case "message":
      return (
        typeof obj.text === "string" &&
        typeof obj.channel === "string" &&
        (obj.target === undefined || typeof obj.target === "string")
      );
    default:
      return false;
  }
}

/**
 * Attempt to parse a JSON string as NativeSchedulerResult.
 * Returns the parsed result or undefined if invalid.
 */
export function parseResult(raw: string): NativeSchedulerResult | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isResult(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Validate and narrow a NativeSchedulerRunContext, throwing on invalid input.
 */
export function assertRunContext(value: unknown): NativeSchedulerRunContext {
  if (!isRunContext(value)) {
    throw new Error("Invalid NativeSchedulerRunContext");
  }
  return value;
}

/**
 * Validate and narrow a NativeSchedulerResult, throwing on invalid input.
 */
export function assertResult(value: unknown): NativeSchedulerResult {
  if (!isResult(value)) {
    throw new Error("Invalid NativeSchedulerResult");
  }
  return value;
}

/**
 * Build a NativeSchedulerRunContext. Validates the result before returning.
 */
export function buildRunContext(params: {
  runId: string;
  jobId: string;
  namespace: string;
  triggeredAt: number;
  platform: string;
  backend: string;
  config?: Record<string, unknown>;
}): NativeSchedulerRunContext {
  const ctx: NativeSchedulerRunContext = {
    schemaVersion: 1,
    runId: params.runId,
    jobId: params.jobId,
    namespace: params.namespace,
    triggeredAt: params.triggeredAt,
    platform: params.platform,
    backend: params.backend,
    config: params.config ?? {},
  };
  return assertRunContext(ctx);
}
