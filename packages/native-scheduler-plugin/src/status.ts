import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type JobHealth = {
  version: 1;
  namespace: string;
  jobId: string;
  backend: "launchd";
  totalRuns: number;
  totalFailures: number;
  consecutiveFailures: number;
  lastRunId?: string;
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastExitCode?: number | null;
};

export type JobRunStatus = {
  version: 1;
  runId: string;
  namespace: string;
  jobId: string;
  backend: "launchd";
  command: string[];
  workingDirectory?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  success: boolean;
  exitCode: number | null;
  signal: string | null;
  failureCallbackTriggered?: boolean;
  failureCallbackError?: string;
  spawnError?: string;
};

export type JobPaths = {
  namespace: string;
  jobId: string;
  rootDir: string;
  runsDir: string;
  latestPath: string;
  healthPath: string;
  wrapperPath: string;
  wrapperConfigPath: string;
};

export function sanitizeStorageSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function requireSegment(value: string, field: string) {
  const cleaned = sanitizeStorageSegment(value);
  if (!cleaned) {
    throw new Error(`${field} resolved to an empty segment`);
  }
  return cleaned;
}

export function resolveOpenClawStateDir(): string {
  const override = process.env.OPENCLAW_STATE_DIR?.trim() || process.env.CLAWDBOT_STATE_DIR?.trim();
  return override ?? path.join(os.homedir(), ".openclaw");
}

export function getDefaultDataDir() {
  return path.join(resolveOpenClawStateDir(), "data", "native-scheduler");
}

export function resolveJobPaths(
  namespace: string,
  jobId: string,
  baseDir = getDefaultDataDir(),
): JobPaths {
  const ns = requireSegment(namespace, "namespace");
  const id = requireSegment(jobId, "job id");
  const rootDir = path.join(baseDir, ns, id);
  return {
    namespace: ns,
    jobId: id,
    rootDir,
    runsDir: path.join(rootDir, "runs"),
    latestPath: path.join(rootDir, "latest.json"),
    healthPath: path.join(rootDir, "health.json"),
    wrapperPath: path.join(rootDir, "runner.mjs"),
    wrapperConfigPath: path.join(rootDir, "runner.config.json"),
  };
}

export async function readJsonIfExists<T>(filePath: string): Promise<T | undefined> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}

export function nextHealth(prev: JobHealth | undefined, run: JobRunStatus): JobHealth {
  return {
    version: 1,
    namespace: run.namespace,
    jobId: run.jobId,
    backend: "launchd",
    totalRuns: (prev?.totalRuns ?? 0) + 1,
    totalFailures: (prev?.totalFailures ?? 0) + (run.success ? 0 : 1),
    consecutiveFailures: run.success ? 0 : (prev?.consecutiveFailures ?? 0) + 1,
    lastRunId: run.runId,
    lastRunAt: run.finishedAt,
    lastSuccessAt: run.success ? run.finishedAt : prev?.lastSuccessAt,
    lastFailureAt: run.success ? prev?.lastFailureAt : run.finishedAt,
    lastExitCode: run.exitCode,
  };
}

export async function appendRun(paths: JobPaths, run: JobRunStatus) {
  await fs.mkdir(paths.runsDir, { recursive: true });

  const runPath = path.join(paths.runsDir, `${run.runId}.json`);
  await fs.writeFile(runPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  await fs.writeFile(paths.latestPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");

  const prev = await readJsonIfExists<JobHealth>(paths.healthPath);
  const next = nextHealth(prev, run);
  await fs.writeFile(paths.healthPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");

  return {
    runPath,
    health: next,
  };
}

/**
 * Migrate a raw value into a valid {@link JobRunStatus}.
 * - Version 1: accepted as-is.
 * - Missing version: treated as v1 with best-effort defaults.
 * - Unknown future version: best-effort mapping to v1 shape.
 */
export function migrateRunStatus(raw: unknown): JobRunStatus {
  if (!raw || typeof raw !== "object") {
    throw new Error("migrateRunStatus: expected an object");
  }
  const obj = raw as Record<string, unknown>;

  // Already v1 — pass through
  if (obj.version === 1) {
    return obj as unknown as JobRunStatus;
  }

  // Missing version or unknown future version — best-effort mapping to v1
  return {
    version: 1,
    runId: typeof obj.runId === "string" ? obj.runId : "unknown",
    namespace: typeof obj.namespace === "string" ? obj.namespace : "unknown",
    jobId: typeof obj.jobId === "string" ? obj.jobId : "unknown",
    backend: "launchd",
    command: Array.isArray(obj.command) ? (obj.command as string[]) : [],
    workingDirectory: typeof obj.workingDirectory === "string" ? obj.workingDirectory : undefined,
    startedAt: typeof obj.startedAt === "string" ? obj.startedAt : new Date(0).toISOString(),
    finishedAt: typeof obj.finishedAt === "string" ? obj.finishedAt : new Date(0).toISOString(),
    durationMs: typeof obj.durationMs === "number" ? obj.durationMs : 0,
    success: typeof obj.success === "boolean" ? obj.success : false,
    exitCode: typeof obj.exitCode === "number" ? obj.exitCode : null,
    signal: typeof obj.signal === "string" ? obj.signal : null,
  };
}

/**
 * Migrate a raw value into a valid {@link JobHealth}.
 * - Version 1: accepted as-is.
 * - Missing version: treated as v1 with best-effort defaults.
 * - Unknown future version: best-effort mapping to v1 shape.
 */
export function migrateHealth(raw: unknown): JobHealth {
  if (!raw || typeof raw !== "object") {
    throw new Error("migrateHealth: expected an object");
  }
  const obj = raw as Record<string, unknown>;

  // Already v1 — pass through
  if (obj.version === 1) {
    return obj as unknown as JobHealth;
  }

  // Missing version or unknown future version — best-effort mapping to v1
  return {
    version: 1,
    namespace: typeof obj.namespace === "string" ? obj.namespace : "unknown",
    jobId: typeof obj.jobId === "string" ? obj.jobId : "unknown",
    backend: "launchd",
    totalRuns: typeof obj.totalRuns === "number" ? obj.totalRuns : 0,
    totalFailures: typeof obj.totalFailures === "number" ? obj.totalFailures : 0,
    consecutiveFailures: typeof obj.consecutiveFailures === "number" ? obj.consecutiveFailures : 0,
    lastRunId: typeof obj.lastRunId === "string" ? obj.lastRunId : undefined,
    lastRunAt: typeof obj.lastRunAt === "string" ? obj.lastRunAt : undefined,
    lastSuccessAt: typeof obj.lastSuccessAt === "string" ? obj.lastSuccessAt : undefined,
    lastFailureAt: typeof obj.lastFailureAt === "string" ? obj.lastFailureAt : undefined,
    lastExitCode:
      typeof obj.lastExitCode === "number" || obj.lastExitCode === null
        ? (obj.lastExitCode as number | null)
        : undefined,
  };
}

export async function listFailureRuns(paths: JobPaths, limit = 10) {
  const entries = await fs.readdir(paths.runsDir, { withFileTypes: true }).catch((error) => {
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

  const names = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort()
    .reverse();

  const failures: JobRunStatus[] = [];

  for (const name of names) {
    if (failures.length >= limit) {
      break;
    }
    const fullPath = path.join(paths.runsDir, name);
    const item = await readJsonIfExists<JobRunStatus>(fullPath);
    if (item && !item.success) {
      failures.push(item);
    }
  }

  return failures;
}
