import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import {
  getBackendStatus,
  getConfiguredBackend,
  getDefaultNamespace,
  type NativeSchedulerBackend,
} from "./backend.js";
import { createLaunchdAdapter } from "./launchd.js";

const CalendarEntrySchema = Type.Object(
  {
    minute: Type.Optional(Type.Integer({ minimum: 0, maximum: 59 })),
    hour: Type.Optional(Type.Integer({ minimum: 0, maximum: 23 })),
    day: Type.Optional(Type.Integer({ minimum: 1, maximum: 31 })),
    weekday: Type.Optional(Type.Integer({ minimum: 0, maximum: 7 })),
    month: Type.Optional(Type.Integer({ minimum: 1, maximum: 12 })),
  },
  { additionalProperties: false },
);

const JobSchema = Type.Object(
  {
    id: Type.String({
      minLength: 1,
      description: "Stable job identifier within the plugin namespace.",
    }),
    description: Type.Optional(Type.String()),
    command: Type.Array(Type.String(), {
      minItems: 1,
      description: "Executable followed by arguments; maps to launchd ProgramArguments.",
    }),
    workingDirectory: Type.Optional(Type.String()),
    environment: Type.Optional(Type.Record(Type.String(), Type.String())),
    runAtLoad: Type.Optional(Type.Boolean()),
    startIntervalSeconds: Type.Optional(
      Type.Integer({ minimum: 1, description: "Simple recurring interval in seconds." }),
    ),
    calendar: Type.Optional(
      Type.Array(CalendarEntrySchema, {
        minItems: 1,
        description: "Calendar schedule entries; on launchd this maps to StartCalendarInterval.",
      }),
    ),
    stdoutPath: Type.Optional(Type.String()),
    stderrPath: Type.Optional(Type.String()),
    disabled: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

const NativeSchedulerToolSchema = Type.Object(
  {
    action: Type.Union([
      Type.Literal("status"),
      Type.Literal("list"),
      Type.Literal("get"),
      Type.Literal("upsert"),
      Type.Literal("remove"),
      Type.Literal("run"),
      Type.Literal("enable"),
      Type.Literal("disable"),
    ]),
    backend: Type.Optional(
      Type.Union([
        Type.Literal("auto"),
        Type.Literal("launchd"),
        Type.Literal("cron"),
        Type.Literal("systemd"),
        Type.Literal("windows-task-scheduler"),
      ]),
    ),
    id: Type.Optional(Type.String({ minLength: 1 })),
    namespace: Type.Optional(Type.String({ minLength: 1 })),
    job: Type.Optional(JobSchema),
  },
  { additionalProperties: false },
);

type CalendarEntry = {
  minute?: number;
  hour?: number;
  day?: number;
  weekday?: number;
  month?: number;
};

type NativeSchedulerJob = {
  id: string;
  description?: string;
  command: string[];
  workingDirectory?: string;
  environment?: Record<string, string>;
  runAtLoad?: boolean;
  startIntervalSeconds?: number;
  calendar?: CalendarEntry[];
  stdoutPath?: string;
  stderrPath?: string;
  disabled?: boolean;
};

type NativeSchedulerToolParams = {
  action: "status" | "list" | "get" | "upsert" | "remove" | "run" | "enable" | "disable";
  backend?: NativeSchedulerBackend | "auto";
  id?: string;
  namespace?: string;
  job?: NativeSchedulerJob;
};

type NativeSchedulerResult = {
  ok: boolean;
  action: NativeSchedulerToolParams["action"];
  backend: string;
  namespace: string;
  data?: unknown;
  error?: string;
};

function toText(result: NativeSchedulerResult) {
  return JSON.stringify(result, null, 2);
}

function resolveNamespace(api: OpenClawPluginApi, params: NativeSchedulerToolParams) {
  return params.namespace ?? getDefaultNamespace(api.pluginConfig);
}

function resolveBackend(api: OpenClawPluginApi, params: NativeSchedulerToolParams) {
  return getConfiguredBackend(api.pluginConfig, params.backend);
}

function requireId(params: NativeSchedulerToolParams) {
  if (!params.id?.trim()) {
    throw new Error("id is required for this action");
  }
  return params.id.trim();
}

function requireJob(params: NativeSchedulerToolParams) {
  if (!params.job) {
    throw new Error("job is required for upsert");
  }
  return params.job;
}

async function executeAction(api: OpenClawPluginApi, params: NativeSchedulerToolParams) {
  const namespace = resolveNamespace(api, params);
  const backend = resolveBackend(api, params);

  if (params.action === "status") {
    return {
      ok: true,
      action: params.action,
      backend,
      namespace,
      data: getBackendStatus(backend, namespace),
    } satisfies NativeSchedulerResult;
  }

  if (backend !== "launchd") {
    return {
      ok: false,
      action: params.action,
      backend,
      namespace,
      error: `Backend ${backend} is not implemented yet. Start with macOS launchd.`,
    } satisfies NativeSchedulerResult;
  }

  const adapter = createLaunchdAdapter({ namespace, logger: api.logger });

  switch (params.action) {
    case "list":
      return {
        ok: true,
        action: params.action,
        backend,
        namespace,
        data: await adapter.list(),
      } satisfies NativeSchedulerResult;
    case "get":
      return {
        ok: true,
        action: params.action,
        backend,
        namespace,
        data: await adapter.get(requireId(params)),
      } satisfies NativeSchedulerResult;
    case "upsert":
      return {
        ok: true,
        action: params.action,
        backend,
        namespace,
        data: await adapter.upsert(requireJob(params)),
      } satisfies NativeSchedulerResult;
    case "remove":
      return {
        ok: true,
        action: params.action,
        backend,
        namespace,
        data: await adapter.remove(requireId(params)),
      } satisfies NativeSchedulerResult;
    case "run":
      return {
        ok: true,
        action: params.action,
        backend,
        namespace,
        data: await adapter.run(requireId(params)),
      } satisfies NativeSchedulerResult;
    case "enable":
      return {
        ok: true,
        action: params.action,
        backend,
        namespace,
        data: await adapter.enable(requireId(params)),
      } satisfies NativeSchedulerResult;
    case "disable":
      return {
        ok: true,
        action: params.action,
        backend,
        namespace,
        data: await adapter.disable(requireId(params)),
      } satisfies NativeSchedulerResult;
    default:
      return {
        ok: false,
        action: params.action,
        backend,
        namespace,
        error: `Unhandled action: ${params.action}`,
      } satisfies NativeSchedulerResult;
  }
}

export function createNativeSchedulerTool(api: OpenClawPluginApi): AnyAgentTool {
  return {
    name: "native_scheduler",
    description:
      "Manage native OS scheduler jobs. Current implementation supports a real macOS launchd adapter plus a cross-platform-shaped tool contract.",
    parameters: NativeSchedulerToolSchema,
    async execute(_id, params: NativeSchedulerToolParams) {
      try {
        const result = await executeAction(api, params);
        return {
          content: [{ type: "text", text: toText(result) }],
        };
      } catch (error) {
        const backend = resolveBackend(api, params);
        const namespace = resolveNamespace(api, params);
        return {
          content: [
            {
              type: "text",
              text: toText({
                ok: false,
                action: params.action,
                backend,
                namespace,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
        };
      }
    },
  } as AnyAgentTool;
}
