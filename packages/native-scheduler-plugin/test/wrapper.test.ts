import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type JobHealth, type JobRunStatus, readJsonIfExists } from "../src/status.js";
import { materializeWrapperJob } from "../src/wrapper.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "native-scheduler-wrapper-test-"));
  tempDirs.push(dir);
  return dir;
}

async function runCommand(command: string[]) {
  return await new Promise<{ code: number; stdout: string }>((resolve, reject) => {
    const child = spawn(command[0]!, command.slice(1), { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout }));
  });
}

describe("wrapper runner", () => {
  it("records successful lifecycle", async () => {
    const baseDir = await makeTempDir();
    const wrapped = await materializeWrapperJob({
      namespace: "dev.ns",
      dataDir: baseDir,
      job: {
        id: "job-success",
        command: [process.execPath, "-e", "process.exit(0)"],
      },
    });

    const { code } = await runCommand(wrapped.command);
    expect(code).toBe(0);

    const latest = await readJsonIfExists<JobRunStatus>(wrapped.paths.latestPath);
    const health = await readJsonIfExists<JobHealth>(wrapped.paths.healthPath);

    expect(latest?.success).toBe(true);
    expect(latest?.exitCode).toBe(0);
    expect(health?.totalRuns).toBe(1);
    expect(health?.totalFailures).toBe(0);
    expect(health?.consecutiveFailures).toBe(0);
  });

  it("records failure and triggers command callback", async () => {
    const baseDir = await makeTempDir();
    const callbackFile = path.join(baseDir, "callback.txt");

    const wrapped = await materializeWrapperJob({
      namespace: "dev.ns",
      dataDir: baseDir,
      job: {
        id: "job-fail",
        command: [process.execPath, "-e", "process.exit(7)"],
        failureCallback: {
          type: "command",
          command: [
            process.execPath,
            "-e",
            [
              "const fs=require('node:fs');",
              `fs.writeFileSync(${JSON.stringify(callbackFile)}, [process.env.NATIVE_SCHEDULER_JOB_ID, process.env.NATIVE_SCHEDULER_EXIT_CODE].join(':'));`,
            ].join(""),
          ],
        },
      },
    });

    const { code } = await runCommand(wrapped.command);
    expect(code).toBe(7);

    const latest = await readJsonIfExists<JobRunStatus>(wrapped.paths.latestPath);
    const health = await readJsonIfExists<JobHealth>(wrapped.paths.healthPath);
    const callback = await fs.readFile(callbackFile, "utf8");

    expect(latest?.success).toBe(false);
    expect(latest?.failureCallbackTriggered).toBe(true);
    expect(health?.totalFailures).toBe(1);
    expect(health?.consecutiveFailures).toBe(1);
    expect(callback).toBe("job-fail:7");
  });

  it("rejects invalid callback command model", async () => {
    await expect(
      materializeWrapperJob({
        namespace: "dev.ns",
        job: {
          id: "job",
          command: ["/usr/bin/true"],
          failureCallback: {
            type: "command",
            command: [],
          },
        },
      }),
    ).rejects.toThrow(/must contain at least one item/);
  });

  it("pipes run context to script stdin", async () => {
    const baseDir = await makeTempDir();
    const stdinDump = path.join(baseDir, "stdin.json");

    // Script that reads stdin, saves it, and exits 0
    const script = [
      "let data = '';",
      "process.stdin.on('data', c => data += c);",
      "process.stdin.on('end', () => {",
      `  require('node:fs').writeFileSync(${JSON.stringify(stdinDump)}, data);`,
      "  process.exit(0);",
      "});",
    ].join("");

    const wrapped = await materializeWrapperJob({
      namespace: "dev.ns",
      dataDir: baseDir,
      job: {
        id: "job-stdin",
        command: [process.execPath, "-e", script],
      },
    });

    const { code } = await runCommand(wrapped.command);
    expect(code).toBe(0);

    const raw = await fs.readFile(stdinDump, "utf8");
    const ctx = JSON.parse(raw);
    expect(ctx.schemaVersion).toBe(1);
    expect(ctx.jobId).toBe("job-stdin");
    expect(ctx.namespace).toBe("dev.ns");
    expect(typeof ctx.runId).toBe("string");
    expect(typeof ctx.triggeredAt).toBe("number");
    expect(ctx.platform).toBe(process.platform);
    expect(ctx.backend).toBe("launchd");
    expect(ctx.config).toEqual({});
  });

  it("parses noop result from stdout", async () => {
    const baseDir = await makeTempDir();

    // Script that reads stdin (drains it) then outputs noop result
    const script = [
      "let d='';",
      "process.stdin.on('data',c=>d+=c);",
      "process.stdin.on('end',()=>{",
      '  process.stdout.write(JSON.stringify({result:"noop"}));',
      "  process.exit(0);",
      "});",
    ].join("");

    const wrapped = await materializeWrapperJob({
      namespace: "dev.ns",
      dataDir: baseDir,
      job: {
        id: "job-noop",
        command: [process.execPath, "-e", script],
      },
    });

    const { code } = await runCommand(wrapped.command);
    expect(code).toBe(0);

    const latest = await readJsonIfExists<Record<string, unknown>>(wrapped.paths.latestPath);
    expect(latest?.success).toBe(true);
    expect(latest?.scriptResult).toEqual({ result: "noop" });
  });

  it("parses prompt result from stdout", async () => {
    const baseDir = await makeTempDir();

    const script = [
      "let d='';",
      "process.stdin.on('data',c=>d+=c);",
      "process.stdin.on('end',()=>{",
      '  process.stdout.write(JSON.stringify({result:"prompt",text:"hello world"}));',
      "  process.exit(0);",
      "});",
    ].join("");

    const wrapped = await materializeWrapperJob({
      namespace: "dev.ns",
      dataDir: baseDir,
      job: {
        id: "job-prompt",
        command: [process.execPath, "-e", script],
      },
    });

    const { code } = await runCommand(wrapped.command);
    expect(code).toBe(0);

    const latest = await readJsonIfExists<Record<string, unknown>>(wrapped.paths.latestPath);
    expect(latest?.success).toBe(true);
    expect(latest?.scriptResult).toEqual({ result: "prompt", text: "hello world" });
  });

  it("parses prompt result with session from stdout", async () => {
    const baseDir = await makeTempDir();

    const script = [
      "let d='';",
      "process.stdin.on('data',c=>d+=c);",
      "process.stdin.on('end',()=>{",
      '  process.stdout.write(JSON.stringify({result:"prompt",text:"alert",session:"agent:main"}));',
      "  process.exit(0);",
      "});",
    ].join("");

    const wrapped = await materializeWrapperJob({
      namespace: "dev.ns",
      dataDir: baseDir,
      job: {
        id: "job-prompt-session",
        command: [process.execPath, "-e", script],
      },
    });

    const { code } = await runCommand(wrapped.command);
    expect(code).toBe(0);

    const latest = await readJsonIfExists<Record<string, unknown>>(wrapped.paths.latestPath);
    expect(latest?.success).toBe(true);
    expect(latest?.scriptResult).toEqual({
      result: "prompt",
      text: "alert",
      session: "agent:main",
    });
  });

  it("parses message result from stdout", async () => {
    const baseDir = await makeTempDir();

    const script = [
      "let d='';",
      "process.stdin.on('data',c=>d+=c);",
      "process.stdin.on('end',()=>{",
      '  process.stdout.write(JSON.stringify({result:"message",text:"hi",channel:"discord",target:"general"}));',
      "  process.exit(0);",
      "});",
    ].join("");

    const wrapped = await materializeWrapperJob({
      namespace: "dev.ns",
      dataDir: baseDir,
      job: {
        id: "job-message",
        command: [process.execPath, "-e", script],
      },
    });

    const { code } = await runCommand(wrapped.command);
    expect(code).toBe(0);

    const latest = await readJsonIfExists<Record<string, unknown>>(wrapped.paths.latestPath);
    expect(latest?.success).toBe(true);
    expect(latest?.scriptResult).toEqual({
      result: "message",
      text: "hi",
      channel: "discord",
      target: "general",
    });
    // messageDelivery should report failure since there's no deliver port in test
    expect(latest?.messageDelivery).toBeDefined();
    expect((latest?.messageDelivery as { delivered: boolean }).delivered).toBe(false);
  });

  it("falls back to exit code when stdout is not valid result JSON", async () => {
    const baseDir = await makeTempDir();

    // Script outputs non-JSON text
    const script = [
      "let d='';",
      "process.stdin.on('data',c=>d+=c);",
      "process.stdin.on('end',()=>{",
      "  process.stdout.write('hello this is not json');",
      "  process.exit(0);",
      "});",
    ].join("");

    const wrapped = await materializeWrapperJob({
      namespace: "dev.ns",
      dataDir: baseDir,
      job: {
        id: "job-fallback",
        command: [process.execPath, "-e", script],
      },
    });

    const { code } = await runCommand(wrapped.command);
    expect(code).toBe(0);

    const latest = await readJsonIfExists<Record<string, unknown>>(wrapped.paths.latestPath);
    expect(latest?.success).toBe(true); // exit code 0 = success fallback
    expect(latest?.scriptResult).toBeUndefined();
  });

  it("falls back to exit code when stdout is empty", async () => {
    const baseDir = await makeTempDir();

    const wrapped = await materializeWrapperJob({
      namespace: "dev.ns",
      dataDir: baseDir,
      job: {
        id: "job-empty-stdout",
        command: [
          process.execPath,
          "-e",
          "process.stdin.resume();process.stdin.on('end',()=>process.exit(3))",
        ],
      },
    });

    const { code } = await runCommand(wrapped.command);
    expect(code).toBe(3);

    const latest = await readJsonIfExists<Record<string, unknown>>(wrapped.paths.latestPath);
    expect(latest?.success).toBe(false);
    expect(latest?.exitCode).toBe(3);
    expect(latest?.scriptResult).toBeUndefined();
  });

  it("falls back when stdout is JSON but not a valid result shape", async () => {
    const baseDir = await makeTempDir();

    const script = [
      "let d='';",
      "process.stdin.on('data',c=>d+=c);",
      "process.stdin.on('end',()=>{",
      '  process.stdout.write(JSON.stringify({foo:"bar"}));',
      "  process.exit(0);",
      "});",
    ].join("");

    const wrapped = await materializeWrapperJob({
      namespace: "dev.ns",
      dataDir: baseDir,
      job: {
        id: "job-invalid-shape",
        command: [process.execPath, "-e", script],
      },
    });

    const { code } = await runCommand(wrapped.command);
    expect(code).toBe(0);

    const latest = await readJsonIfExists<Record<string, unknown>>(wrapped.paths.latestPath);
    expect(latest?.success).toBe(true); // fallback: exit 0 = success
    expect(latest?.scriptResult).toBeUndefined();
  });

  it("applies defaultFailureResult when script crashes with no output", async () => {
    const baseDir = await makeTempDir();

    const wrapped = await materializeWrapperJob({
      namespace: "dev.ns",
      dataDir: baseDir,
      job: {
        id: "job-default-failure",
        command: [
          process.execPath,
          "-e",
          "process.stdin.resume();process.stdin.on('end',()=>process.exit(1))",
        ],
        defaultFailureResult: { result: "noop" },
      },
    });

    const { code } = await runCommand(wrapped.command);
    expect(code).toBe(1);

    const latest = await readJsonIfExists<Record<string, unknown>>(wrapped.paths.latestPath);
    expect(latest?.success).toBe(false);
    expect(latest?.scriptResult).toEqual({ result: "noop" });
  });

  it("applies defaultFailureResult with prompt when script crashes", async () => {
    const baseDir = await makeTempDir();

    const wrapped = await materializeWrapperJob({
      namespace: "dev.ns",
      dataDir: baseDir,
      job: {
        id: "job-default-prompt",
        command: [
          process.execPath,
          "-e",
          "process.stdin.resume();process.stdin.on('end',()=>process.exit(2))",
        ],
        defaultFailureResult: { result: "prompt", text: "Job crashed!" },
      },
    });

    const { code } = await runCommand(wrapped.command);
    expect(code).toBe(2);

    const latest = await readJsonIfExists<Record<string, unknown>>(wrapped.paths.latestPath);
    expect(latest?.success).toBe(false);
    expect(latest?.scriptResult).toEqual({ result: "prompt", text: "Job crashed!" });
    // Prompt delivery will fail in test since openclaw CLI isn't available
    expect(latest?.promptDelivery).toBeDefined();
  });

  it("does not apply defaultFailureResult when script succeeds", async () => {
    const baseDir = await makeTempDir();

    const wrapped = await materializeWrapperJob({
      namespace: "dev.ns",
      dataDir: baseDir,
      job: {
        id: "job-no-default",
        command: [process.execPath, "-e", "process.exit(0)"],
        defaultFailureResult: { result: "prompt", text: "should not appear" },
      },
    });

    const { code } = await runCommand(wrapped.command);
    expect(code).toBe(0);

    const latest = await readJsonIfExists<Record<string, unknown>>(wrapped.paths.latestPath);
    expect(latest?.success).toBe(true);
    // No scriptResult because stdout was empty and script succeeded
    expect(latest?.scriptResult).toBeUndefined();
  });

  it("does not apply defaultFailureResult when script produces valid output", async () => {
    const baseDir = await makeTempDir();

    const script = [
      "let d='';",
      "process.stdin.on('data',c=>d+=c);",
      "process.stdin.on('end',()=>{",
      '  process.stdout.write(JSON.stringify({result:"noop"}));',
      "  process.exit(1);",
      "});",
    ].join("");

    const wrapped = await materializeWrapperJob({
      namespace: "dev.ns",
      dataDir: baseDir,
      job: {
        id: "job-output-overrides-default",
        command: [process.execPath, "-e", script],
        defaultFailureResult: { result: "prompt", text: "should not appear" },
      },
    });

    const { code } = await runCommand(wrapped.command);
    expect(code).toBe(1);

    const latest = await readJsonIfExists<Record<string, unknown>>(wrapped.paths.latestPath);
    expect(latest?.success).toBe(false);
    // Script produced valid output, so defaultFailureResult is NOT applied
    expect(latest?.scriptResult).toEqual({ result: "noop" });
  });

  it("retries failing failure callback up to maxAttempts and records error", async () => {
    const baseDir = await makeTempDir();
    const attemptFile = path.join(baseDir, "attempts.txt");

    // Callback script that records each attempt then exits non-zero
    const callbackScript = [
      "const fs=require('node:fs');",
      `const f=${JSON.stringify(attemptFile)};`,
      "const prev=fs.existsSync(f)?fs.readFileSync(f,'utf8'):'';",
      "fs.writeFileSync(f, prev+'x');",
      "process.exit(1);",
    ].join("");

    const wrapped = await materializeWrapperJob({
      namespace: "dev.ns",
      dataDir: baseDir,
      job: {
        id: "job-retry-callback",
        command: [process.execPath, "-e", "process.exit(7)"],
        failureCallback: {
          type: "command",
          command: [process.execPath, "-e", callbackScript],
        },
      },
    });

    const { code } = await runCommand(wrapped.command);
    expect(code).toBe(7);

    const latest = await readJsonIfExists<Record<string, unknown>>(wrapped.paths.latestPath);
    expect(latest?.success).toBe(false);
    expect(latest?.failureCallbackTriggered).toBe(true);
    // Should have recorded an error after exhausting retries
    expect(latest?.failureCallbackError).toBeDefined();
    expect(typeof latest?.failureCallbackError).toBe("string");

    // Verify the callback was attempted 3 times
    const attempts = await fs.readFile(attemptFile, "utf8");
    expect(attempts).toBe("xxx");
  }, 15_000);

  it("rejects old failure result type from stdout", async () => {
    const baseDir = await makeTempDir();

    // Script outputs the old failure result format — should be rejected
    const script = [
      "let d='';",
      "process.stdin.on('data',c=>d+=c);",
      "process.stdin.on('end',()=>{",
      '  process.stdout.write(JSON.stringify({result:"failure",error:"old format"}));',
      "  process.exit(0);",
      "});",
    ].join("");

    const wrapped = await materializeWrapperJob({
      namespace: "dev.ns",
      dataDir: baseDir,
      job: {
        id: "job-old-failure",
        command: [process.execPath, "-e", script],
      },
    });

    const { code } = await runCommand(wrapped.command);
    expect(code).toBe(0);

    const latest = await readJsonIfExists<Record<string, unknown>>(wrapped.paths.latestPath);
    expect(latest?.success).toBe(true); // exit 0, old failure format is not recognized
    expect(latest?.scriptResult).toBeUndefined(); // rejected
  });
});
