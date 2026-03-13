import fs from "node:fs/promises";
import path from "node:path";
import type { Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { jsonResult } from "openclaw/plugin-sdk";
import { TemplateValueSchema } from "./templateValueSchema.js";
import { SentinelToolSchema, SentinelToolValidationSchema } from "./toolSchema.js";
import {
  type DeliveryTarget,
  SENTINEL_ORIGIN_ACCOUNT_METADATA,
  SENTINEL_ORIGIN_CHANNEL_METADATA,
  SENTINEL_ORIGIN_SESSION_KEY_METADATA,
  SENTINEL_ORIGIN_TARGET_METADATA,
} from "./types.js";
import type { WatcherManager } from "./watcherManager.js";

export type SentinelToolParams = Static<typeof SentinelToolValidationSchema>;

function validateParams(params: unknown): SentinelToolParams {
  const candidate = (params ?? {}) as Record<string, unknown>;
  if (!Value.Check(SentinelToolValidationSchema, [TemplateValueSchema], candidate)) {
    const first = [
      ...Value.Errors(SentinelToolValidationSchema, [TemplateValueSchema], candidate),
    ][0];
    const where = first?.path || "(root)";
    const why = first?.message || "Invalid parameters";
    throw new Error(`Invalid sentinel_control parameters at ${where}: ${why}`);
  }
  return candidate as SentinelToolParams;
}

function stringifyPayload(payload: unknown): string | undefined {
  try {
    const serialized = JSON.stringify(payload, null, 2);
    if (typeof serialized !== "string" || serialized.length === 0) return undefined;
    return serialized;
  } catch {
    return undefined;
  }
}

function normalizeToolResultText(
  payload: unknown,
  fallbackText?: string,
): ReturnType<typeof jsonResult> {
  const preferredText = fallbackText?.trim();
  const safeText =
    preferredText && preferredText.length > 0 ? preferredText : (stringifyPayload(payload) ?? "ok");

  const result = jsonResult(payload) as ReturnType<typeof jsonResult>;
  const currentContent = Array.isArray((result as any).content)
    ? ([...(result as any).content] as any[])
    : [];

  let sawTextBlock = false;
  const normalized = currentContent.map((entry) => {
    if (!entry || typeof entry !== "object" || entry.type !== "text") return entry;
    sawTextBlock = true;
    if (typeof entry.text === "string" && entry.text.length > 0) return entry;
    return { ...entry, text: safeText };
  });

  if (!sawTextBlock) {
    normalized.unshift({ type: "text", text: safeText });
  }

  return {
    ...result,
    content: normalized,
  } as ReturnType<typeof jsonResult>;
}

type SentinelToolContext = {
  messageChannel?: string;
  requesterSenderId?: string;
  agentAccountId?: string;
  sessionKey?: string;
};

type RegisterToolFn = (tool: AnyAgentTool | ((ctx: SentinelToolContext) => AnyAgentTool)) => void;

function inferDefaultDeliveryTargets(ctx: SentinelToolContext): DeliveryTarget[] {
  const channel = ctx.messageChannel?.trim();
  if (!channel) return [];

  const fromSender = ctx.requesterSenderId?.trim();
  if (fromSender) {
    return [{ channel, to: fromSender, accountId: ctx.agentAccountId }];
  }

  const sessionPeer = ctx.sessionKey?.split(":").at(-1)?.trim();
  if (sessionPeer) {
    return [{ channel, to: sessionPeer, accountId: ctx.agentAccountId }];
  }

  return [];
}

function maybeSetMetadata(
  metadata: Record<string, string>,
  key: string,
  value: string | undefined,
): void {
  const trimmed = value?.trim();
  if (!trimmed) return;
  if (!metadata[key]) metadata[key] = trimmed;
}

function addOriginDeliveryMetadata(
  watcher: Record<string, unknown>,
  ctx: SentinelToolContext,
): Record<string, unknown> {
  const metadataRaw = watcher.metadata;
  const metadata =
    metadataRaw && typeof metadataRaw === "object" && !Array.isArray(metadataRaw)
      ? { ...(metadataRaw as Record<string, string>) }
      : {};

  const sessionPeer = ctx.sessionKey?.split(":").at(-1)?.trim();

  maybeSetMetadata(metadata, SENTINEL_ORIGIN_SESSION_KEY_METADATA, ctx.sessionKey);
  maybeSetMetadata(metadata, SENTINEL_ORIGIN_CHANNEL_METADATA, ctx.messageChannel);
  maybeSetMetadata(metadata, SENTINEL_ORIGIN_TARGET_METADATA, ctx.requesterSenderId ?? sessionPeer);
  maybeSetMetadata(metadata, SENTINEL_ORIGIN_ACCOUNT_METADATA, ctx.agentAccountId);

  if (Object.keys(metadata).length === 0) return watcher;
  return {
    ...watcher,
    metadata,
  };
}

export function registerSentinelControl(
  registerTool: RegisterToolFn,
  manager: WatcherManager,
): void {
  registerTool((ctx) => ({
    name: "sentinel_control",
    label: "sentinel_control",
    description: "Create/manage sentinel watchers",
    parameters: SentinelToolSchema,
    async execute(_toolCallId, params: SentinelToolParams) {
      const payload = validateParams(params);
      switch (payload.action) {
        case "create":
        case "add": {
          const operatorGoalContent = (payload as Record<string, unknown>).operatorGoalContent as
            | string
            | undefined;
          const watcherRaw = payload.watcher as unknown as Record<string, unknown>;
          const fireRaw = watcherRaw.fire as Record<string, unknown> | undefined;
          const operatorGoalFile = fireRaw?.operatorGoalFile as string | undefined;

          if (operatorGoalContent && !operatorGoalFile) {
            throw new Error(
              "operatorGoalContent requires operatorGoalFile to be set on the watcher",
            );
          }

          let goalFileWritten: string | undefined;
          if (operatorGoalContent && operatorGoalFile) {
            const dataDir = manager.resolvedDataDir;
            const goalDir = path.resolve(path.join(dataDir, "operator-goals"));
            const candidate = path.resolve(path.join(goalDir, operatorGoalFile));

            if (!candidate.startsWith(goalDir + path.sep) && candidate !== goalDir) {
              throw new Error(`operatorGoalFile path escapes workspace: ${operatorGoalFile}`);
            }

            await fs.mkdir(path.dirname(candidate), { recursive: true });
            await fs.writeFile(candidate, operatorGoalContent, "utf8");
            goalFileWritten = candidate;
          }

          const watcherWithContext = addOriginDeliveryMetadata(watcherRaw, ctx);
          const created = await manager.create(watcherWithContext, {
            deliveryTargets: inferDefaultDeliveryTargets(ctx),
          });
          const result: Record<string, unknown> = { ...created };
          if (goalFileWritten) {
            result.goalFileWritten = goalFileWritten;
          }
          return normalizeToolResultText(result, "Watcher created");
        }
        case "enable":
          await manager.enable(payload.id);
          return normalizeToolResultText(undefined, `Enabled watcher: ${payload.id}`);
        case "disable":
          await manager.disable(payload.id);
          return normalizeToolResultText(undefined, `Disabled watcher: ${payload.id}`);
        case "remove":
        case "delete":
          try {
            return normalizeToolResultText(
              await manager.remove(payload.id),
              `Removed watcher: ${payload.id}`,
            );
          } catch (err) {
            const message = String((err as Error | undefined)?.message ?? err);
            return normalizeToolResultText(
              { ok: false, id: payload.id, error: message },
              `Failed to remove watcher: ${payload.id}`,
            );
          }
        case "status":
        case "get":
          return normalizeToolResultText(
            manager.status(payload.id),
            `Watcher not found: ${payload.id}`,
          );
        case "list":
          return normalizeToolResultText(manager.list(), "[]");
      }
    },
  }));
}
