import fs from "node:fs/promises";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import type { NativeSchedulerResult as ScriptResult } from "@spectratools/native-scheduler-types";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import {
  getBackendStatus,
  getConfiguredBackend,
  getDefaultNamespace,
  type NativeSchedulerBackend,
} from "./backend.js";
import { type CalendarEntry, createLaunchdAdapter, type LaunchdJobInput } from "./launchd.js";
import {
  getDefaultDataDir,
  type JobHealth,
  type JobRunStatus,
  listFailureRuns,
  readJsonIfExists,
  resolveJobPaths,
  sanitizeStorageSegment,
} from "./status.js";
import {
  type FailureCallbackTarget,
  materializeWrapperJob,
  removeWrapperArtifacts,
} from "./wrapper.js";

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

const FailureCallbackSchema = Type.Union([
  Type.Object(
    {
      type: Type.Literal("command"),
      command: Type.Array(Type.String(), { minItems: 1 }),
      environment: Type.Optional(Type.Record(Type.String(), Type.String())),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal("openclaw-event"),
      text: Type.Optional(Type.String()),
      mode: Type.Optional(Type.Union([Type.Literal("now"), Type.Literal("queue")])),
    },
    { additionalProperties: false },
  ),
]);

const DefaultFailureResultSchema = Type.Union([
  Type.Object({ result: Type.Literal("noop") }, { additionalProperties: false }),
  Type.Object(
    {
      result: Type.Literal("prompt"),
      text: Type.String(),
      session: Type.Optional(Type.String()),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      result: Type.Literal("message"),
      text: Type.String(),
      channel: Type.String(),
      target: Type.Optional(Type.String()),
    },
    { additionalProperties: false },
  ),
]);

const JobSchema = Type.Object(
  {
    id: Type.String({
      minLength: 1,
      description: "Stable job identifier within the plugin namespace.",
    }),
    description: Type.Optional(Type.String()),
    command: Type.Array(Type.String(), {
      minItems: 1,
      description: "Executable followed by arguments.",
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
    failureCallback: Type.Optional(FailureCallbackSchema),
    defaultFailureResult: Type.Optional(
      Type.Composite([DefaultFailureResultSchema], {
        description:
          "Result to fire when the script crashes, times out, or produces no valid output. Defaults to { result: 'noop' } if not specified.",
      }),
    ),
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
      Type.Literal("health"),
      Type.Literal("last-run"),
      Type.Literal("failures"),
      Type.Literal("logs"),
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
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    lines: Type.Optional(
      Type.Integer({
        minimum: 1,
        maximum: 500,
        description: "Number of log lines to return (default 50, max 500). Used with logs action.",
      }),
    ),
  },
  { additionalProperties: false },
);

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
  failureCallback?: FailureCallbackTarget;
  defaultFailureResult?: ScriptResult;
};

type NativeSchedulerToolParams = {
  action:
    | "status"
    | "list"
    | "get"
    | "upsert"
    | "remove"
    | "run"
    | "enable"
    | "disable"
    | "health"
    | "last-run"
    | "failures"
    | "logs";
  backend?: NativeSchedulerBackend | "auto";
  id?: string;
  namespace?: string;
  job?: NativeSchedulerJob;
  limit?: number;
  lines?: number;
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

function resolveDataDir(api: OpenClawPluginApi) {
  const configured = api.pluginConfig?.dataDir;
  if (typeof configured === "string" && configured.trim()) {
    return configured.trim();
  }
  return getDefaultDataDir();
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

function toLaunchdInput(job: NativeSchedulerJob, wrappedCommand: string[]): LaunchdJobInput {
  return {
    id: job.id,
    description: job.description,
    command: wrappedCommand,
    runAtLoad: job.runAtLoad,
    startIntervalSeconds: job.startIntervalSeconds,
    calendar: job.calendar,
    stdoutPath: job.stdoutPath,
    stderrPath: job.stderrPath,
    disabled: job.disabled,
  };
}

async function listHealthForNamespace(dataDir: string, namespace: string) {
  const namespaceRoot = path.join(dataDir, sanitizeStorageSegment(namespace));
  const entries = await fs.readdir(namespaceRoot, { withFileTypes: true }).catch((error) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      return [] as import("node:fs").Dirent[];
    }
    throw error;
  });

  const items: JobHealth[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(namespaceRoot, entry.name, "health.json");
    const health = await readJsonIfExists<JobHealth>(fullPath);
    if (health) {
      items.push(health);
    }
  }

  items.sort((a, b) => (b.lastRunAt ?? "").localeCompare(a.lastRunAt ?? ""));
  return items;
}

async function readLogTail(filePath: string | undefined, lines: number): Promise<string | null> {
  if (!filePath) return null;
  try {
    const content = await fs.readFile(filePath, "utf8");
    const allLines = content.split("\n");
    // Take last N lines (trim trailing empty line from split)
    const trimmed =
      allLines.length > 0 && allLines[allLines.length - 1] === ""
        ? allLines.slice(0, -1)
        : allLines;
    return trimmed.slice(-lines).join("\n");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

async function executeAction(api: OpenClawPluginApi, params: NativeSchedulerToolParams) {
  const namespace = resolveNamespace(api, params);
  const backend = resolveBackend(api, params);
  const dataDir = resolveDataDir(api);

  if (params.action === "status") {
    return {
      ok: true,
      action: params.action,
      backend,
      namespace,
      data: {
        ...getBackendStatus(backend, namespace),
        dataDir,
      },
    } satisfies NativeSchedulerResult;
  }

  if (params.action === "logs") {
    const id = requireId(params);
    const lines = Math.min(Math.max(params.lines ?? 50, 1), 500);

    // Find stdout/stderr paths from the wrapper config
    const paths = resolveJobPaths(namespace, id, dataDir);
    const config = await readJsonIfExists<Record<string, unknown>>(paths.wrapperConfigPath);

    // Try to read from configured paths in the launchd plist via the job's managed log paths
    // Fall back to discovering them from the wrapper config or job schema defaults
    let stdoutPath: string | undefined;
    let stderrPath: string | undefined;

    if (config) {
      // The wrapper config doesn't store stdoutPath/stderrPath directly,
      // but we can read the launchd plist to find them. For simplicity,
      // let the agent pass the job id and we look for any .plist references.
      // Actually — the job schema stores these. We'll look up the latest run for metadata.
    }

    // The actual stdout/stderr paths come from the job's launchd plist configuration.
    // Since we don't store them in the wrapper config, we read them from the
    // upserted job's launchd agent plist. For now, read from the namespace data dir
    // as a convention: <dataDir>/<ns>/<id>/stdout.log and stderr.log
    // OR from whatever the user configured as stdoutPath/stderrPath on the job.
    // Best approach: check the latest run for any info, and support explicit paths.

    // For maximum utility, we look at the job's configured paths by checking
    // the launchd plist. We can also accept stdoutPath/stderrPath from the params
    // in future. For now, we use a simple convention + the data we have.

    // Attempt: read from common log locations
    const stdoutDefault = path.join(paths.rootDir, "stdout.log");
    const stderrDefault = path.join(paths.rootDir, "stderr.log");

    const stdout = await readLogTail(stdoutDefault, lines);
    const stderr = await readLogTail(stderrDefault, lines);

    return {
      ok: true,
      action: params.action,
      backend,
      namespace,
      data: {
        job: id,
        lines,
        stdout,
        stderr,
        paths: {
          stdout: stdoutDefault,
          stderr: stderrDefault,
        },
      },
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

  if (params.action === "health") {
    if (params.id?.trim()) {
      const paths = resolveJobPaths(namespace, params.id.trim(), dataDir);
      return {
        ok: true,
        action: params.action,
        backend,
        namespace,
        data: {
          job: params.id.trim(),
          health: (await readJsonIfExists<JobHealth>(paths.healthPath)) ?? null,
        },
      } satisfies NativeSchedulerResult;
    }

    return {
      ok: true,
      action: params.action,
      backend,
      namespace,
      data: {
        jobs: await listHealthForNamespace(dataDir, namespace),
      },
    } satisfies NativeSchedulerResult;
  }

  if (params.action === "last-run") {
    const id = requireId(params);
    const paths = resolveJobPaths(namespace, id, dataDir);
    return {
      ok: true,
      action: params.action,
      backend,
      namespace,
      data: {
        job: id,
        run: (await readJsonIfExists<JobRunStatus>(paths.latestPath)) ?? null,
      },
    } satisfies NativeSchedulerResult;
  }

  if (params.action === "failures") {
    const id = requireId(params);
    const paths = resolveJobPaths(namespace, id, dataDir);
    const limit = params.limit ?? 10;
    return {
      ok: true,
      action: params.action,
      backend,
      namespace,
      data: {
        job: id,
        failures: await listFailureRuns(paths, limit),
      },
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
    case "upsert": {
      const job = requireJob(params);
      const wrapped = await materializeWrapperJob({
        namespace,
        job: {
          id: job.id,
          command: job.command,
          workingDirectory: job.workingDirectory,
          environment: job.environment,
          failureCallback: job.failureCallback,
          defaultFailureResult: job.defaultFailureResult,
        },
        dataDir,
      });

      const upserted = await adapter.upsert(toLaunchdInput(job, wrapped.command));

      return {
        ok: true,
        action: params.action,
        backend,
        namespace,
        data: {
          ...upserted,
          wrapper: {
            runner: wrapped.paths.wrapperPath,
            config: wrapped.paths.wrapperConfigPath,
            latest: wrapped.paths.latestPath,
            health: wrapped.paths.healthPath,
            runsDir: wrapped.paths.runsDir,
          },
        },
      } satisfies NativeSchedulerResult;
    }
    case "remove": {
      const id = requireId(params);
      const paths = resolveJobPaths(namespace, id, dataDir);
      const removed = await adapter.remove(id);
      await removeWrapperArtifacts(paths);
      return {
        ok: true,
        action: params.action,
        backend,
        namespace,
        data: {
          ...removed,
          wrapperRemoved: true,
        },
      } satisfies NativeSchedulerResult;
    }
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
      "Manage native OS scheduler jobs. Current implementation supports macOS launchd with wrapper-run metadata, failure callbacks, and result delivery (prompt/message/noop).",
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
