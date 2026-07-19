/**
 * Pure, dependency-free policy logic for approval-gate.
 *
 * This module intentionally has no OpenClaw or logging imports. It evaluates
 * exact agent/tool matches, generic parameter checks, and bounded summaries
 * without exposing raw tool parameter objects.
 */

export const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;
export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 256;
export const SUMMARY_VALUE_MAX = 64;
export const SUMMARY_LABEL_MAX = 32;
export const MAX_SUMMARY_FIELDS = 8;

export const ALLOWED_DECISIONS: ReadonlyArray<"allow-once" | "deny"> = ["allow-once", "deny"];

export type ParameterCheckKind = "present" | "uuid" | "allowlist";
export type RedactionMode = "none" | "last4" | "suffix6";

export interface ParameterCheck {
  parameter: string;
  kind: ParameterCheckKind;
  allowedValues: string[];
}

export interface SummaryField {
  parameter: string;
  label: string;
  redaction: RedactionMode;
}

export interface ApprovalRule {
  id: string;
  agentId: string;
  toolName: string;
  approvalTitle?: string;
  checks: ParameterCheck[];
  summaryFields: SummaryField[];
}

export interface ApprovalGateConfig {
  rules: ApprovalRule[];
}

export interface ApprovalRequest {
  title: string;
  description: string;
  severity: "critical";
  timeoutMs: number;
  timeoutBehavior: "deny";
  allowedDecisions: ReadonlyArray<"allow-once" | "deny">;
}

export type ToolDecision =
  | { kind: "bypass" }
  | { kind: "block"; reason: string }
  | { kind: "approve"; approval: ApprovalRequest };

export interface EvaluateInput {
  toolName: string;
  agentId: string | undefined;
  params: Record<string, unknown>;
  config: ApprovalGateConfig;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 1) return value.slice(0, Math.max(0, max));
  return `${value.slice(0, max - 1)}…`;
}

export function matchesRule(
  rule: ApprovalRule,
  toolName: string,
  agentId: string | undefined,
): boolean {
  return agentId === rule.agentId && toolName === rule.toolName;
}

export function resolveParameter(params: Record<string, unknown>, parameter: string): unknown {
  let current: unknown = params;
  for (const segment of parameter.split(".")) {
    if (!isRecord(current) || !Object.hasOwn(current, segment)) return undefined;
    current = current[segment];
  }
  return current;
}

export function isPresent(value: unknown): boolean {
  return (
    value !== undefined && value !== null && !(typeof value === "string" && value.length === 0)
  );
}

export function passesCheck(value: unknown, check: ParameterCheck): boolean {
  switch (check.kind) {
    case "present":
      return isPresent(value);
    case "uuid":
      return isUuid(value);
    case "allowlist":
      return typeof value === "string" && check.allowedValues.includes(value);
  }
}

export function redactSummaryValue(value: unknown, redaction: RedactionMode): string {
  const normalized = summaryScalar(value);
  if (normalized === undefined) return "";

  switch (redaction) {
    case "none":
      return truncate(normalized, SUMMARY_VALUE_MAX);
    case "last4":
      return normalized.length < 4 ? "••••" : `••${normalized.slice(-4)}`;
    case "suffix6":
      return `…${normalized.slice(-6)}`;
  }
}

export function buildApproval(
  rules: ApprovalRule[],
  params: Record<string, unknown>,
): ApprovalRequest {
  const first = rules[0];
  const fallbackTitle = first ? `Approve ${first.toolName}` : "Approve tool call";
  const title = truncate(first?.approvalTitle ?? fallbackTitle, TITLE_MAX);
  const summaryParts: string[] = [];

  for (const rule of rules) {
    for (const field of rule.summaryFields.slice(0, MAX_SUMMARY_FIELDS)) {
      const value = redactSummaryValue(resolveParameter(params, field.parameter), field.redaction);
      if (!value) continue;
      const label = truncate(field.label, SUMMARY_LABEL_MAX);
      summaryParts.push(`${label}: ${value}`);
      if (summaryParts.length >= MAX_SUMMARY_FIELDS) break;
    }
    if (summaryParts.length >= MAX_SUMMARY_FIELDS) break;
  }

  const description = truncate(
    summaryParts.length > 0 ? summaryParts.join(" · ") : "No parameter summary configured.",
    DESCRIPTION_MAX,
  );

  return {
    title,
    description,
    severity: "critical",
    timeoutMs: APPROVAL_TIMEOUT_MS,
    timeoutBehavior: "deny",
    allowedDecisions: ALLOWED_DECISIONS,
  };
}

/**
 * Evaluate every rule matching the exact tool name and exact agent id.
 * Overlapping rules are additive: all checks must pass, and bounded summary
 * fields are collected in configuration order.
 */
export function evaluateToolCall(input: EvaluateInput): ToolDecision {
  const matchingRules = input.config.rules.filter((rule) =>
    matchesRule(rule, input.toolName, input.agentId),
  );
  if (matchingRules.length === 0) return { kind: "bypass" };

  for (const rule of matchingRules) {
    for (const check of rule.checks) {
      if (!passesCheck(resolveParameter(input.params, check.parameter), check)) {
        return {
          kind: "block",
          reason: `Blocked by approval rule "${safeIdentifier(rule.id)}": parameter "${safeIdentifier(check.parameter)}" failed the ${check.kind} check.`,
        };
      }
    }
  }

  return { kind: "approve", approval: buildApproval(matchingRules, input.params) };
}

/** Normalize manifest-validated config while safely ignoring malformed rules. */
export function resolveConfig(raw: unknown): ApprovalGateConfig {
  if (!isRecord(raw) || !Array.isArray(raw.rules)) return { rules: [] };

  const rules: ApprovalRule[] = [];
  for (const [index, value] of raw.rules.entries()) {
    if (!isRecord(value) || !nonEmptyString(value.agentId) || !nonEmptyString(value.toolName)) {
      continue;
    }

    const checks = Array.isArray(value.checks)
      ? value.checks.flatMap((check) => normalizeCheck(check))
      : [];
    const summaryFields = Array.isArray(value.summaryFields)
      ? value.summaryFields
          .slice(0, MAX_SUMMARY_FIELDS)
          .flatMap((field) => normalizeSummaryField(field))
      : [];

    rules.push({
      id: nonEmptyString(value.id) ? value.id : `rule-${index + 1}`,
      agentId: value.agentId,
      toolName: value.toolName,
      approvalTitle: nonEmptyString(value.approvalTitle) ? value.approvalTitle : undefined,
      checks,
      summaryFields,
    });
  }

  return { rules };
}

function normalizeCheck(value: unknown): ParameterCheck[] {
  if (!isRecord(value) || !nonEmptyString(value.parameter) || !isCheckKind(value.kind)) {
    return [];
  }
  const allowedValues = Array.isArray(value.allowedValues)
    ? value.allowedValues.filter((item): item is string => typeof item === "string")
    : [];
  return [{ parameter: value.parameter, kind: value.kind, allowedValues }];
}

function normalizeSummaryField(value: unknown): SummaryField[] {
  if (!isRecord(value) || !nonEmptyString(value.parameter) || !isRedactionMode(value.redaction)) {
    return [];
  }
  return [
    {
      parameter: value.parameter,
      label: nonEmptyString(value.label) ? value.label : value.parameter,
      redaction: value.redaction,
    },
  ];
}

function summaryScalar(value: unknown): string | undefined {
  if (typeof value === "string") return sanitizeCharacters(value, " ").trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean" || typeof value === "bigint") return String(value);
  return undefined;
}

function safeIdentifier(value: string): string {
  return truncate(sanitizeCharacters(value, "_", true), SUMMARY_VALUE_MAX);
}

function sanitizeCharacters(value: string, replacement: string, identifiers = false): string {
  let output = "";
  let replacing = false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    const replace =
      code <= 31 || code === 127 || (identifiers && (character === '"' || character === "\\"));
    if (replace) {
      if (!replacing) output += replacement;
      replacing = true;
    } else {
      output += character;
      replacing = false;
    }
  }
  return output;
}

function isCheckKind(value: unknown): value is ParameterCheckKind {
  return value === "present" || value === "uuid" || value === "allowlist";
}

function isRedactionMode(value: unknown): value is RedactionMode {
  return value === "none" || value === "last4" || value === "suffix6";
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
