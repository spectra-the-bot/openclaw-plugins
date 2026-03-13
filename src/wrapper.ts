import fs from "node:fs/promises";
import path from "node:path";
import { resolveJobPaths, type JobPaths } from "./status.js";

export type FailureCallbackTarget =
  | {
      type: "command";
      command: string[];
      environment?: Record<string, string>;
    }
  | {
      type: "openclaw-event";
      text?: string;
      mode?: "now" | "queue";
    };

export type WrapperJobInput = {
  id: string;
  command: string[];
  description?: string;
  workingDirectory?: string;
  environment?: Record<string, string>;
  failureCallback?: FailureCallbackTarget;
};

export type WrapperMaterializeOptions = {
  namespace: string;
  job: WrapperJobInput;
  dataDir?: string;
};

export type WrapperMaterialized = {
  command: string[];
  paths: JobPaths;
};

const WRAPPER_SCRIPT = `#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

async function readConfig(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function buildRunId() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(16).slice(2, 10);
  return stamp + "-" + suffix;
}

function runCommand(command, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: options.cwd,
      env: options.env,
      stdio: options.stdio ?? "inherit",
    });

    child.on("error", (error) => {
      resolve({ code: 127, signal: null, spawnError: error instanceof Error ? error.message : String(error) });
    });

    child.on("close", (code, signal) => {
      resolve({ code: code ?? 1, signal, spawnError: undefined });
    });
  });
}

function nextHealth(prev, run) {
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

async function triggerFailureCallback(config, run) {
  if (!config.failureCallback) {
    return { triggered: false };
  }

  const callback = config.failureCallback;
  const env = {
    ...process.env,
    NATIVE_SCHEDULER_NAMESPACE: config.namespace,
    NATIVE_SCHEDULER_JOB_ID: config.jobId,
    NATIVE_SCHEDULER_RUN_ID: run.runId,
    NATIVE_SCHEDULER_EXIT_CODE: String(run.exitCode ?? ""),
    NATIVE_SCHEDULER_SUCCESS: String(run.success),
  };

  if (callback.type === "command") {
    if (!Array.isArray(callback.command) || callback.command.length === 0) {
      return { triggered: false, error: "invalid command callback" };
    }
    const result = await runCommand(callback.command, {
      env: { ...env, ...(callback.environment ?? {}) },
      stdio: "ignore",
    });
    if (result.code !== 0) {
      return { triggered: true, error: "callback exited with code " + String(result.code) };
    }
    return { triggered: true };
  }

  if (callback.type === "openclaw-event") {
    const text = callback.text
      ? callback.text +
        " (job " +
        config.namespace +
        "/" +
        config.jobId +
        ", run " +
        run.runId +
        ", exit " +
        String(run.exitCode ?? "unknown") +
        ")"
      : "[native-scheduler] job failed: " +
        config.namespace +
        "/" +
        config.jobId +
        " run=" +
        run.runId +
        " exit=" +
        String(run.exitCode ?? "unknown");

    const args = [
      "system",
      "event",
      "--mode",
      callback.mode ?? "now",
      "--text",
      text,
    ];
    const result = await runCommand(["openclaw", ...args], { env, stdio: "ignore" });
    if (result.code !== 0) {
      return { triggered: true, error: "openclaw event exited with code " + String(result.code) };
    }
    return { triggered: true };
  }

  return { triggered: false, error: "unsupported callback type" };
}

async function main() {
  const configPath = process.argv[2];
  if (!configPath) {
    throw new Error("runner config path argument is required");
  }

  const config = await readConfig(configPath);
  await fs.mkdir(config.paths.runsDir, { recursive: true });

  const runId = buildRunId();
  const startedAtMs = Date.now();
  const startedAt = nowIso();

  const commandResult = await runCommand(config.command, {
    cwd: config.workingDirectory,
    env: { ...process.env, ...(config.environment ?? {}) },
    stdio: "inherit",
  });

  const finishedAtMs = Date.now();
  const finishedAt = nowIso();

  const run = {
    version: 1,
    runId,
    namespace: config.namespace,
    jobId: config.jobId,
    backend: "launchd",
    command: config.command,
    workingDirectory: config.workingDirectory,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, finishedAtMs - startedAtMs),
    success: commandResult.code === 0,
    exitCode: commandResult.code,
    signal: commandResult.signal ?? null,
    spawnError: commandResult.spawnError,
  };

  if (!run.success) {
    const callback = await triggerFailureCallback(config, run);
    run.failureCallbackTriggered = callback.triggered;
    if (callback.error) {
      run.failureCallbackError = callback.error;
    }
  }

  const runPath = path.join(config.paths.runsDir, runId + ".json");
  await fs.writeFile(runPath, JSON.stringify(run, null, 2) + "\\n", "utf8");
  await fs.writeFile(config.paths.latestPath, JSON.stringify(run, null, 2) + "\\n", "utf8");

  const prev = await readJsonIfExists(config.paths.healthPath);
  const health = nextHealth(prev, run);
  await fs.writeFile(config.paths.healthPath, JSON.stringify(health, null, 2) + "\\n", "utf8");

  process.exit(run.exitCode ?? 1);
}

main().catch(async (error) => {
  try {
    const text = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(text + "\\n");
  } catch {
    // ignore
  }
  process.exit(1);
});
`;

function assertCommand(command: string[]) {
  if (!Array.isArray(command) || command.length === 0) {
    throw new Error("job.command must contain at least one item");
  }
}

function validateCallback(callback: FailureCallbackTarget | undefined) {
  if (!callback) return;
  if (callback.type === "command") {
    if (!Array.isArray(callback.command) || callback.command.length === 0) {
      throw new Error("job.failureCallback.command must contain at least one item");
    }
  }
}

export async function materializeWrapperJob(
  options: WrapperMaterializeOptions,
): Promise<WrapperMaterialized> {
  assertCommand(options.job.command);
  validateCallback(options.job.failureCallback);

  const paths = resolveJobPaths(options.namespace, options.job.id, options.dataDir);
  await fs.mkdir(paths.rootDir, { recursive: true });

  const runtimeConfig = {
    namespace: paths.namespace,
    jobId: paths.jobId,
    command: options.job.command,
    workingDirectory: options.job.workingDirectory,
    environment: options.job.environment,
    failureCallback: options.job.failureCallback,
    paths: {
      runsDir: paths.runsDir,
      latestPath: paths.latestPath,
      healthPath: paths.healthPath,
    },
  };

  await fs.writeFile(
    paths.wrapperConfigPath,
    `${JSON.stringify(runtimeConfig, null, 2)}\n`,
    "utf8",
  );
  await fs.writeFile(paths.wrapperPath, WRAPPER_SCRIPT, { mode: 0o755 });

  return {
    command: [process.execPath, paths.wrapperPath, paths.wrapperConfigPath],
    paths,
  };
}

export async function removeWrapperArtifacts(paths: JobPaths) {
  await fs.rm(paths.wrapperPath, { force: true });
  await fs.rm(paths.wrapperConfigPath, { force: true });
}

export function getWrapperScriptForTests() {
  return WRAPPER_SCRIPT;
}
