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

// ── Environment variables ─────────────────────────────────────────────

/**
 * Environment variables injected by the native-scheduler wrapper into
 * the script subprocess.
 *
 * - `OPENCLAW_RESULT_FILE` — Path to a run-specific temporary JSON file.
 *   Scripts can write their `NativeSchedulerResult` JSON to this file
 *   instead of (or in addition to) stdout. The runner reads the file
 *   first; if it exists and contains valid JSON, that result takes
 *   priority over stdout. This allows scripts to freely use stdout for
 *   debug/log output without breaking result delivery.
 *
 *   The runner cleans up the file after reading. If the file is absent,
 *   empty, or contains invalid JSON, the runner falls back to parsing
 *   stdout (backward compatible).
 */
export const NATIVE_SCHEDULER_ENV_VARS = ["OPENCLAW_RESULT_FILE"] as const;

export type NativeSchedulerEnvVar = (typeof NATIVE_SCHEDULER_ENV_VARS)[number];

// ── Output: parsed from script stdout or OPENCLAW_RESULT_FILE ─────────

export type NativeSchedulerNoopResult = { result: "noop" };
export type NativeSchedulerPromptResult = {
  result: "prompt";
  text: string;
  session?: string;
};
/**
 * Delivers a message directly to a channel without invoking an LLM agent turn (zero tokens).
 *
 * `channel` must be one of the built-in OpenClaw channel providers:
 * `discord` | `telegram` | `slack` | `signal` | `imessage` | `whatsapp` | `line`
 *
 * Plugin-added channels (e.g. xmtp, matrix) are NOT supported via this result type —
 * use `{ result: "prompt" }` instead and let the agent dispatch to the channel.
 * Once OpenClaw exposes `dispatchChannelMessageAction` on the plugin runtime API,
 * this restriction can be lifted.
 */
export type NativeSchedulerMessageResult = {
  result: "message";
  text: string;
  channel: "discord" | "telegram" | "slack" | "signal" | "imessage" | "whatsapp" | "line";
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

export const VALID_MESSAGE_CHANNELS = new Set([
  "discord",
  "telegram",
  "slack",
  "signal",
  "imessage",
  "whatsapp",
  "line",
] as const);

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
        VALID_MESSAGE_CHANNELS.has(obj.channel as NativeSchedulerMessageResult["channel"]) &&
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
