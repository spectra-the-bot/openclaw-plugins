import { describe, expect, it } from "vitest";
import {
  isRunContext,
  isResult,
  parseResult,
  assertRunContext,
  assertResult,
  buildRunContext,
  type NativeSchedulerRunContext,
  type NativeSchedulerResult,
} from "../src/index.js";

const validContext: NativeSchedulerRunContext = {
  schemaVersion: 1,
  runId: "run-123",
  jobId: "job-abc",
  namespace: "dev.openclaw.test",
  triggeredAt: 1710288000000,
  platform: "darwin",
  backend: "launchd",
  config: { foo: "bar" },
};

describe("isRunContext", () => {
  it("accepts a valid context", () => {
    expect(isRunContext(validContext)).toBe(true);
  });

  it("accepts context with empty config", () => {
    expect(isRunContext({ ...validContext, config: {} })).toBe(true);
  });

  it("rejects null", () => {
    expect(isRunContext(null)).toBe(false);
  });

  it("rejects non-object", () => {
    expect(isRunContext("string")).toBe(false);
    expect(isRunContext(42)).toBe(false);
  });

  it("rejects wrong schemaVersion", () => {
    expect(isRunContext({ ...validContext, schemaVersion: 2 })).toBe(false);
  });

  it("rejects missing runId", () => {
    const { runId, ...rest } = validContext;
    expect(isRunContext(rest)).toBe(false);
  });

  it("rejects non-string jobId", () => {
    expect(isRunContext({ ...validContext, jobId: 123 })).toBe(false);
  });

  it("rejects NaN triggeredAt", () => {
    expect(isRunContext({ ...validContext, triggeredAt: NaN })).toBe(false);
  });

  it("rejects Infinity triggeredAt", () => {
    expect(isRunContext({ ...validContext, triggeredAt: Infinity })).toBe(false);
  });

  it("rejects array config", () => {
    expect(isRunContext({ ...validContext, config: [] })).toBe(false);
  });

  it("rejects null config", () => {
    expect(isRunContext({ ...validContext, config: null })).toBe(false);
  });
});

describe("isResult", () => {
  it("accepts noop", () => {
    expect(isResult({ result: "noop" })).toBe(true);
  });

  it("accepts prompt with text", () => {
    expect(isResult({ result: "prompt", text: "hello" })).toBe(true);
  });

  it("accepts failure with error", () => {
    expect(isResult({ result: "failure", error: "boom" })).toBe(true);
  });

  it("accepts failure with error and code", () => {
    expect(isResult({ result: "failure", error: "boom", code: 42 })).toBe(true);
  });

  it("rejects null", () => {
    expect(isResult(null)).toBe(false);
  });

  it("rejects unknown result type", () => {
    expect(isResult({ result: "unknown" })).toBe(false);
  });

  it("rejects prompt without text", () => {
    expect(isResult({ result: "prompt" })).toBe(false);
  });

  it("rejects prompt with non-string text", () => {
    expect(isResult({ result: "prompt", text: 42 })).toBe(false);
  });

  it("rejects failure without error", () => {
    expect(isResult({ result: "failure" })).toBe(false);
  });

  it("rejects failure with non-finite code", () => {
    expect(isResult({ result: "failure", error: "x", code: NaN })).toBe(false);
    expect(isResult({ result: "failure", error: "x", code: Infinity })).toBe(false);
  });

  it("accepts noop with extra fields (lenient)", () => {
    expect(isResult({ result: "noop", extra: true })).toBe(true);
  });
});

describe("parseResult", () => {
  it("parses valid noop JSON", () => {
    expect(parseResult('{"result":"noop"}')).toEqual({ result: "noop" });
  });

  it("parses valid prompt JSON", () => {
    const r = parseResult('{"result":"prompt","text":"hi"}');
    expect(r).toEqual({ result: "prompt", text: "hi" });
  });

  it("returns undefined for invalid JSON", () => {
    expect(parseResult("not json")).toBeUndefined();
  });

  it("returns undefined for valid JSON but invalid result", () => {
    expect(parseResult('{"result":"unknown"}')).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(parseResult("")).toBeUndefined();
  });

  it("handles JSON with trailing whitespace", () => {
    expect(parseResult('{"result":"noop"}\n')).toEqual({ result: "noop" });
  });
});

describe("assertRunContext", () => {
  it("returns valid context", () => {
    expect(assertRunContext(validContext)).toEqual(validContext);
  });

  it("throws on invalid context", () => {
    expect(() => assertRunContext({})).toThrow("Invalid NativeSchedulerRunContext");
  });
});

describe("assertResult", () => {
  it("returns valid result", () => {
    const r: NativeSchedulerResult = { result: "noop" };
    expect(assertResult(r)).toEqual(r);
  });

  it("throws on invalid result", () => {
    expect(() => assertResult({ result: "bad" })).toThrow("Invalid NativeSchedulerResult");
  });
});

describe("buildRunContext", () => {
  it("builds a valid context with defaults", () => {
    const ctx = buildRunContext({
      runId: "r1",
      jobId: "j1",
      namespace: "ns",
      triggeredAt: 1000,
      platform: "darwin",
      backend: "launchd",
    });
    expect(ctx.schemaVersion).toBe(1);
    expect(ctx.config).toEqual({});
    expect(isRunContext(ctx)).toBe(true);
  });

  it("builds a valid context with config", () => {
    const ctx = buildRunContext({
      runId: "r1",
      jobId: "j1",
      namespace: "ns",
      triggeredAt: 1000,
      platform: "linux",
      backend: "systemd",
      config: { key: "val" },
    });
    expect(ctx.config).toEqual({ key: "val" });
  });
});
