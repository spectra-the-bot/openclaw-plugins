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

export function getDefaultDataDir() {
  return path.join(os.homedir(), ".openclaw", "native-scheduler");
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
