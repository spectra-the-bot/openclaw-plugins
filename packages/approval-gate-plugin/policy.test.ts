import { describe, expect, it } from "vitest";
import {
  ALLOWED_DECISIONS,
  APPROVAL_TIMEOUT_MS,
  type ApprovalGateConfig,
  type ApprovalRule,
  buildApproval,
  DESCRIPTION_MAX,
  evaluateToolCall,
  isPresent,
  isUuid,
  MAX_SUMMARY_FIELDS,
  matchesRule,
  passesCheck,
  redactSummaryValue,
  resolveConfig,
  resolveParameter,
  SUMMARY_VALUE_MAX,
  TITLE_MAX,
} from "./policy.js";

const UUID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const TOOL = "payments__submit";
const AGENT = "payments";

const rule: ApprovalRule = {
  id: "submit-payment",
  agentId: AGENT,
  toolName: TOOL,
  approvalTitle: "Approve payment submission",
  checks: [
    { parameter: "request_id", kind: "uuid", allowedValues: [] },
    { parameter: "account", kind: "allowlist", allowedValues: ["acct-secret-1234"] },
    { parameter: "amount", kind: "present", allowedValues: [] },
  ],
  summaryFields: [
    { parameter: "amount", label: "Amount", redaction: "none" },
    { parameter: "account", label: "Account", redaction: "last4" },
    { parameter: "request_id", label: "Request", redaction: "suffix6" },
  ],
};

const config: ApprovalGateConfig = { rules: [rule] };

function params(overrides: Record<string, unknown> = {}) {
  return {
    request_id: UUID,
    account: "acct-secret-1234",
    amount: "$25.00",
    ...overrides,
  };
}

describe("exact matching", () => {
  it("matches only identical tool names and agent ids", () => {
    expect(matchesRule(rule, TOOL, AGENT)).toBe(true);
    expect(matchesRule(rule, `${TOOL} `, AGENT)).toBe(false);
    expect(matchesRule(rule, TOOL.toUpperCase(), AGENT)).toBe(false);
    expect(matchesRule(rule, TOOL, `${AGENT} `)).toBe(false);
    expect(matchesRule(rule, TOOL, undefined)).toBe(false);
  });

  it.each([
    ["other__tool", AGENT],
    [TOOL, "main"],
    [TOOL, undefined],
  ])("bypasses non-matching calls", (toolName, agentId) => {
    expect(evaluateToolCall({ toolName, agentId, params: params(), config })).toEqual({
      kind: "bypass",
    });
  });
});

describe("parameter checks", () => {
  it("resolves own-property dot paths without walking prototypes", () => {
    expect(resolveParameter({ order: { id: "123" } }, "order.id")).toBe("123");
    expect(resolveParameter({ order: {} }, "order.id")).toBeUndefined();
    expect(resolveParameter({}, "toString")).toBeUndefined();
  });

  it("implements present checks without rejecting zero or false", () => {
    expect(isPresent(undefined)).toBe(false);
    expect(isPresent(null)).toBe(false);
    expect(isPresent("")).toBe(false);
    expect(isPresent(" ")).toBe(true);
    expect(isPresent(0)).toBe(true);
    expect(isPresent(false)).toBe(true);
  });

  it("accepts canonical UUIDs and rejects malformed or non-string values", () => {
    expect(isUuid(UUID)).toBe(true);
    expect(isUuid(UUID.toUpperCase())).toBe(true);
    expect(isUuid("f47ac10b58cc4372a5670e02b2c3d479")).toBe(false);
    expect(isUuid("f47ac10b-58cc-0372-a567-0e02b2c3d479")).toBe(false);
    expect(isUuid(123)).toBe(false);
  });

  it("uses exact string equality for allowlists", () => {
    const check = { parameter: "env", kind: "allowlist" as const, allowedValues: ["prod"] };
    expect(passesCheck("prod", check)).toBe(true);
    expect(passesCheck("PROD", check)).toBe(false);
    expect(passesCheck("prod ", check)).toBe(false);
    expect(passesCheck(1, check)).toBe(false);
  });

  it.each([
    ["missing UUID", { request_id: undefined }, "uuid"],
    ["invalid UUID", { request_id: "not-a-uuid" }, "uuid"],
    ["missing allowlisted field", { account: undefined }, "allowlist"],
    ["disallowed value", { account: "acct-secret-9999" }, "allowlist"],
    ["missing required field", { amount: undefined }, "present"],
  ])("blocks %s without exposing the raw value", (_name, overrides, kind) => {
    const decision = evaluateToolCall({
      toolName: TOOL,
      agentId: AGENT,
      params: params(overrides),
      config,
    });
    expect(decision.kind).toBe("block");
    if (decision.kind !== "block") return;
    expect(decision.reason).toContain(`${kind} check`);
    expect(decision.reason).not.toContain("acct-secret-9999");
    expect(decision.reason).not.toContain("not-a-uuid");
  });
});

describe("approval safety invariants", () => {
  it("requires critical allow-once/deny approval with timeout deny", () => {
    const decision = evaluateToolCall({ toolName: TOOL, agentId: AGENT, params: params(), config });
    expect(decision.kind).toBe("approve");
    if (decision.kind !== "approve") return;
    expect(decision.approval).toMatchObject({
      severity: "critical",
      timeoutMs: 10 * 60 * 1000,
      timeoutBehavior: "deny",
      allowedDecisions: ["allow-once", "deny"],
    });
    expect(decision.approval.timeoutMs).toBe(APPROVAL_TIMEOUT_MS);
    expect(ALLOWED_DECISIONS).toEqual(["allow-once", "deny"]);
    expect(decision.approval.allowedDecisions).not.toContain("allow-always");
  });

  it("includes only explicitly configured, redacted summary fields", () => {
    const decision = evaluateToolCall({
      toolName: TOOL,
      agentId: AGENT,
      params: params({ unconfigured_secret: "must-never-appear" }),
      config,
    });
    expect(decision.kind).toBe("approve");
    if (decision.kind !== "approve") return;
    expect(decision.approval.title).toBe("Approve payment submission");
    expect(decision.approval.description).toContain("Amount: $25.00");
    expect(decision.approval.description).toContain("Account: ••1234");
    expect(decision.approval.description).toContain("Request: …c3d479");
    expect(decision.approval.description).not.toContain("acct-secret-1234");
    expect(decision.approval.description).not.toContain(UUID);
    expect(decision.approval.description).not.toContain("must-never-appear");
  });

  it("bounds titles, values, field count, and descriptions", () => {
    const longFields = Array.from({ length: MAX_SUMMARY_FIELDS + 5 }, (_, index) => ({
      parameter: `field${index}`,
      label: `L${index}`,
      redaction: "none" as const,
    }));
    const longRule: ApprovalRule = {
      ...rule,
      approvalTitle: "T".repeat(200),
      checks: [],
      summaryFields: longFields,
    };
    const compactValues = Object.fromEntries(longFields.map((field) => [field.parameter, "v"]));
    const approval = buildApproval([longRule], compactValues);
    expect(approval.title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(approval.description.match(/L\d: v/g)?.length).toBe(MAX_SUMMARY_FIELDS);

    const longValues = Object.fromEntries(
      longFields.map((field) => [field.parameter, `value-${"x".repeat(200)}`]),
    );
    expect(buildApproval([longRule], longValues).description.length).toBeLessThanOrEqual(
      DESCRIPTION_MAX,
    );
    expect(redactSummaryValue("x".repeat(200), "none").length).toBe(SUMMARY_VALUE_MAX);
  });

  it("does not serialize complex values into summaries", () => {
    expect(redactSummaryValue({ secret: "hidden" }, "none")).toBe("");
    expect(redactSummaryValue(["hidden"], "none")).toBe("");
    expect(redactSummaryValue(Number.NaN, "none")).toBe("");
  });

  it("sanitizes control characters in unredacted strings", () => {
    expect(redactSummaryValue("line1\nline2\u0000", "none")).toBe("line1 line2");
  });

  it("uses a safe generic description when no summaries are configured", () => {
    expect(buildApproval([{ ...rule, summaryFields: [] }], params()).description).toBe(
      "No parameter summary configured.",
    );
  });
});

describe("multiple declarative rules", () => {
  it("applies all checks from overlapping exact rules", () => {
    const second: ApprovalRule = {
      id: "production-only",
      agentId: AGENT,
      toolName: TOOL,
      checks: [{ parameter: "environment", kind: "allowlist", allowedValues: ["production"] }],
      summaryFields: [],
    };
    const decision = evaluateToolCall({
      toolName: TOOL,
      agentId: AGENT,
      params: params({ environment: "staging" }),
      config: { rules: [rule, second] },
    });
    expect(decision.kind).toBe("block");
    if (decision.kind === "block") expect(decision.reason).toContain("production-only");
  });

  it("combines bounded summaries from overlapping rules in order", () => {
    const second: ApprovalRule = {
      id: "environment",
      agentId: AGENT,
      toolName: TOOL,
      checks: [],
      summaryFields: [{ parameter: "environment", label: "Environment", redaction: "none" }],
    };
    const decision = evaluateToolCall({
      toolName: TOOL,
      agentId: AGENT,
      params: params({ environment: "production" }),
      config: { rules: [rule, second] },
    });
    expect(decision.kind).toBe("approve");
    if (decision.kind === "approve") {
      expect(decision.approval.description).toContain("Environment: production");
    }
  });
});

describe("configuration normalization", () => {
  it("normalizes valid declarative rules without changing match strings", () => {
    expect(
      resolveConfig({
        rules: [
          {
            id: " exact ",
            agentId: " agent ",
            toolName: " tool ",
            approvalTitle: "Approve action",
            checks: [
              { parameter: "id", kind: "uuid" },
              { parameter: "region", kind: "allowlist", allowedValues: ["us-east-1", 5] },
              { parameter: "ignored", kind: "unknown" },
            ],
            summaryFields: [{ parameter: "region", redaction: "none" }],
          },
        ],
      }),
    ).toEqual({
      rules: [
        {
          id: " exact ",
          agentId: " agent ",
          toolName: " tool ",
          approvalTitle: "Approve action",
          checks: [
            { parameter: "id", kind: "uuid", allowedValues: [] },
            { parameter: "region", kind: "allowlist", allowedValues: ["us-east-1"] },
          ],
          summaryFields: [{ parameter: "region", label: "region", redaction: "none" }],
        },
      ],
    });
  });

  it("defaults to no rules and ignores malformed entries", () => {
    expect(resolveConfig(undefined)).toEqual({ rules: [] });
    expect(resolveConfig({ rules: [{ agentId: "a" }, null, "bad"] })).toEqual({ rules: [] });
  });
});
