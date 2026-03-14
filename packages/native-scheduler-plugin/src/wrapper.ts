import fs from "node:fs/promises";
import type { NativeSchedulerResult } from "@spectratools/native-scheduler-types";
import { type JobPaths, resolveJobPaths } from "./status.js";

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
  defaultFailureResult?: NativeSchedulerResult;
};

export type WrapperMaterializeOptions = {
  namespace: string;
  job: WrapperJobInput;
  dataDir?: string;
  /** Port of the OpenClaw gateway HTTP server. Used for zero-token message delivery. */
  deliverPort?: number;
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
import http from "node:http";

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

function buildRunContext(config, runId) {
  return {
    schemaVersion: 1,
    runId,
    jobId: config.jobId,
    namespace: config.namespace,
    triggeredAt: Date.now(),
    platform: process.platform,
    backend: config.backend ?? "launchd",
    config: config.pluginConfig ?? {},
  };
}

function parseScriptResult(stdout) {
  if (!stdout || !stdout.trim()) return undefined;
  try {
    const parsed = JSON.parse(stdout.trim());
    if (parsed && typeof parsed === "object" && typeof parsed.result === "string") {
      const validTypes = new Set(["noop", "prompt", "message"]);
      if (!validTypes.has(parsed.result)) return undefined;
      if (parsed.result === "prompt" && typeof parsed.text !== "string") return undefined;
      if (parsed.result === "message" && (typeof parsed.text !== "string" || typeof parsed.channel !== "string")) return undefined;
      return parsed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function runCommand(command, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: options.cwd,
      env: options.env,
      stdio: options.stdio ?? ["pipe", "pipe", "inherit"],
    });

    let stdout = "";
    let settled = false;

    const timeoutMs = options.timeoutMs ?? 20_000;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGKILL");
        resolve({ code: 1, signal: "SIGKILL", stdout, spawnError: "command timed out" });
      }
    }, timeoutMs);

    if (options.stdinData != null) {
      child.stdin.write(options.stdinData);
      child.stdin.end();
    } else if (child.stdin) {
      child.stdin.end();
    }

    if (child.stdout) {
      child.stdout.on("data", (chunk) => { stdout += chunk; });
    }

    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ code: 127, signal: null, stdout, spawnError: error instanceof Error ? error.message : String(error) });
      }
    });

    child.on("close", (code, signal) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ code: code ?? 1, signal, stdout, spawnError: undefined });
      }
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryWithBackoff(fn, opts) {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseMs = opts.baseMs ?? 500;
  const factor = opts.factor ?? 3;

  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        const delay = baseMs * Math.pow(factor, attempt);
        await sleep(delay);
      }
    }
  }
  return { __retryExhausted: true, error: lastError instanceof Error ? lastError.message : String(lastError) };
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

async function triggerFailureCallbackOnce(config, run) {
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
      throw new Error("callback exited with code " + String(result.code));
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
    const result = await runCommand(["openclaw", ...args], { env, stdio: "ignore", timeoutMs: 8_000 });
    if (result.code !== 0) {
      throw new Error("openclaw event exited with code " + String(result.code));
    }
    return { triggered: true };
  }

  return { triggered: false, error: "unsupported callback type" };
}

async function triggerFailureCallback(config, run) {
  if (!config.failureCallback) {
    return { triggered: false };
  }
  const result = await retryWithBackoff(
    () => triggerFailureCallbackOnce(config, run),
    { maxAttempts: 3, baseMs: 500, factor: 3 },
  );
  if (result && result.__retryExhausted) {
    return { triggered: true, error: result.error };
  }
  return result;
}

async function deliverPromptResultOnce(scriptResult) {
  const args = ["system", "event", "--mode", "now", "--text", scriptResult.text];
  if (scriptResult.session) {
    args.push("--session", scriptResult.session);
  }
  // 8s timeout: delivery is best-effort; a slow/unreachable gateway should not
  // block the wrapper from completing and writing status files.
  const result = await runCommand(["openclaw", ...args], { stdio: "ignore", timeoutMs: 8_000 });
  if (result.code !== 0) {
    throw new Error("openclaw event exited with code " + String(result.code));
  }
  return { delivered: true };
}

async function deliverPromptResult(scriptResult) {
  const result = await retryWithBackoff(
    () => deliverPromptResultOnce(scriptResult),
    { maxAttempts: 3, baseMs: 500, factor: 3 },
  );
  if (result && result.__retryExhausted) {
    return { delivered: false, error: result.error };
  }
  return result;
}

function deliverMessageResultOnce(scriptResult, config) {
  const deliverPort = config.deliverPort;
  if (!deliverPort) {
    return Promise.resolve({ delivered: false, error: "no deliverPort configured — message delivery unavailable", __noRetry: true });
  }

  const payload = JSON.stringify({
    text: scriptResult.text,
    channel: scriptResult.channel,
    target: scriptResult.target,
    namespace: config.namespace,
    jobId: config.jobId,
  });

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: deliverPort,
        path: "/native-scheduler/deliver",
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ delivered: true });
          } else {
            reject(new Error("deliver responded with status " + String(res.statusCode) + ": " + body));
          }
        });
      },
    );
    req.on("error", (err) => {
      reject(new Error("deliver request failed: " + String(err.message ?? err)));
    });
    req.write(payload);
    req.end();
  });
}

async function deliverMessageResult(scriptResult, config) {
  // Check for missing port before retrying
  const deliverPort = config.deliverPort;
  if (!deliverPort) {
    return { delivered: false, error: "no deliverPort configured — message delivery unavailable" };
  }
  const result = await retryWithBackoff(
    () => deliverMessageResultOnce(scriptResult, config),
    { maxAttempts: 3, baseMs: 500, factor: 3 },
  );
  if (result && result.__retryExhausted) {
    return { delivered: false, error: result.error };
  }
  return result;
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

  const runContext = buildRunContext(config, runId);
  const stdinData = JSON.stringify(runContext);

  // Create a result file path for the script to write results to.
  // This avoids the fragile stdout-as-JSON pattern where debug output breaks parsing.
  const resultFilePath = path.join(config.paths.runsDir, "result-" + runId + ".json");
  await fs.mkdir(config.paths.runsDir, { recursive: true });

  const commandResult = await runCommand(config.command, {
    cwd: config.workingDirectory,
    env: { ...process.env, ...(config.environment ?? {}), OPENCLAW_RESULT_FILE: resultFilePath },
    stdinData,
  });

  const finishedAtMs = Date.now();
  const finishedAt = nowIso();

  // Try reading result from OPENCLAW_RESULT_FILE first, fall back to stdout parsing.
  let scriptResult;
  let resultFileContent;
  try {
    resultFileContent = await fs.readFile(resultFilePath, "utf8");
  } catch {
    // File doesn't exist — expected for scripts that don't use it.
  }
  // Clean up the temp result file regardless of outcome.
  try { await fs.unlink(resultFilePath); } catch { /* ignore */ }

  if (resultFileContent && resultFileContent.trim()) {
    scriptResult = parseScriptResult(resultFileContent);
  }
  // Fall back to stdout parsing for backward compatibility.
  if (!scriptResult) {
    scriptResult = parseScriptResult(commandResult.stdout);
  }

  // Apply defaultFailureResult when script crashes, times out, or produces no valid output
  const scriptFailed = commandResult.code !== 0 || commandResult.spawnError;
  if (!scriptResult && scriptFailed && config.defaultFailureResult) {
    scriptResult = config.defaultFailureResult;
  }

  // Determine success: exit code based (no more "failure" result type)
  let success = commandResult.code === 0;
  let exitCode = commandResult.code;

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
    success,
    exitCode,
    signal: commandResult.signal ?? null,
    spawnError: commandResult.spawnError,
    scriptResult: scriptResult ?? undefined,
  };

  // Deliver results based on type
  if (scriptResult) {
    if (scriptResult.result === "prompt") {
      const delivery = await deliverPromptResult(scriptResult);
      run.promptDelivery = delivery;
    } else if (scriptResult.result === "message") {
      const delivery = await deliverMessageResult(scriptResult, config);
      run.messageDelivery = delivery;
    }
  }

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

  const runtimeConfig: Record<string, unknown> = {
    namespace: paths.namespace,
    jobId: paths.jobId,
    command: options.job.command,
    workingDirectory: options.job.workingDirectory,
    environment: options.job.environment,
    failureCallback: options.job.failureCallback,
    backend: "launchd",
    pluginConfig: {},
    paths: {
      runsDir: paths.runsDir,
      latestPath: paths.latestPath,
      healthPath: paths.healthPath,
    },
  };

  if (options.job.defaultFailureResult) {
    runtimeConfig.defaultFailureResult = options.job.defaultFailureResult;
  }

  if (options.deliverPort) {
    runtimeConfig.deliverPort = options.deliverPort;
  }

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
