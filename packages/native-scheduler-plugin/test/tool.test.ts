import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createNativeSchedulerTool } from "../src/tool.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "native-scheduler-tool-test-"));
  tempDirs.push(dir);
  return dir;
}

function parsePayload(result: unknown) {
  const text = (result as { content: Array<{ text: string }> }).content[0]!.text;
  return JSON.parse(text) as Record<string, unknown>;
}

describe("native_scheduler tool", () => {
  it("reports platform error for mismatched backend", async () => {
    const mismatchedBackend = process.platform === "darwin" ? "systemd" : "launchd";
    const api = {
      pluginConfig: { defaultBackend: mismatchedBackend },
      logger: {},
    } as any;
    const tool = createNativeSchedulerTool(api);
    const output = parsePayload(await tool.execute("1", { action: "list" } as any));
    expect(output.ok).toBe(false);
    expect(String(output.error)).toBeDefined();
  });

  it("returns health/last-run/failures from status files", async () => {
    const baseDir = await makeTempDir();
    const nsDir = path.join(baseDir, "test.ns", "job-a");
    const runsDir = path.join(nsDir, "runs");
    await fs.mkdir(runsDir, { recursive: true });

    await fs.writeFile(
      path.join(nsDir, "health.json"),
      JSON.stringify({
        version: 1,
        namespace: "test.ns",
        jobId: "job-a",
        backend: "launchd",
        totalRuns: 2,
        totalFailures: 1,
        consecutiveFailures: 0,
      }),
      "utf8",
    );

    await fs.writeFile(
      path.join(nsDir, "latest.json"),
      JSON.stringify({
        version: 1,
        runId: "run-2",
        namespace: "test.ns",
        jobId: "job-a",
        backend: "launchd",
        command: ["/usr/bin/true"],
        startedAt: "2026-03-12T00:00:00.000Z",
        finishedAt: "2026-03-12T00:00:01.000Z",
        durationMs: 1000,
        success: true,
        exitCode: 0,
        signal: null,
      }),
      "utf8",
    );

    await fs.writeFile(
      path.join(runsDir, "run-1.json"),
      JSON.stringify({
        version: 1,
        runId: "run-1",
        namespace: "test.ns",
        jobId: "job-a",
        backend: "launchd",
        command: ["/usr/bin/false"],
        startedAt: "2026-03-12T00:00:00.000Z",
        finishedAt: "2026-03-12T00:00:01.000Z",
        durationMs: 1000,
        success: false,
        exitCode: 2,
        signal: null,
      }),
      "utf8",
    );

    const api = {
      pluginConfig: { defaultBackend: "launchd", namespace: "test.ns", dataDir: baseDir },
      logger: {},
    } as any;

    const tool = createNativeSchedulerTool(api);

    const health = parsePayload(await tool.execute("1", { action: "health" } as any));
    expect((health.data as { jobs: unknown[] }).jobs).toHaveLength(1);

    const lastRun = parsePayload(
      await tool.execute("1", { action: "last-run", id: "job-a" } as any),
    );
    expect((lastRun.data as { run: { runId: string } }).run.runId).toBe("run-2");

    const failures = parsePayload(
      await tool.execute("1", { action: "failures", id: "job-a" } as any),
    );
    expect((failures.data as { failures: unknown[] }).failures).toHaveLength(1);
  });

  it("validates required args", async () => {
    const api = {
      pluginConfig: { defaultBackend: "launchd" },
      logger: {},
    } as any;
    const tool = createNativeSchedulerTool(api);

    const upsert = parsePayload(await tool.execute("1", { action: "upsert" } as any));
    expect(upsert.ok).toBe(false);
    // On macOS: "job is required"; on others: "launchd adapter is only available on macOS"
    expect(typeof upsert.error).toBe("string");
    expect((upsert.error as string).length).toBeGreaterThan(0);

    // failures validates id before touching adapter, so "id is required" on all platforms
    const failures = parsePayload(await tool.execute("1", { action: "failures" } as any));
    expect(failures.ok).toBe(false);
    expect(String(failures.error)).toContain("id is required");
  });

  it("reads logs from managed log paths", async () => {
    const baseDir = await makeTempDir();
    const nsDir = path.join(baseDir, "test.ns", "my-job");
    await fs.mkdir(nsDir, { recursive: true });

    // Write stdout and stderr log files
    const stdoutContent = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
    await fs.writeFile(path.join(nsDir, "stdout.log"), stdoutContent, "utf8");
    await fs.writeFile(path.join(nsDir, "stderr.log"), "error line 1\nerror line 2\n", "utf8");

    const api = {
      pluginConfig: { defaultBackend: "launchd", namespace: "test.ns", dataDir: baseDir },
      logger: {},
    } as any;

    const tool = createNativeSchedulerTool(api);

    // Default 50 lines
    const result = parsePayload(await tool.execute("1", { action: "logs", id: "my-job" } as any));
    expect(result.ok).toBe(true);
    const data = result.data as {
      stdout: string | null;
      stderr: string | null;
      lines: number;
    };
    expect(data.lines).toBe(50);
    expect(data.stdout).toBeDefined();
    expect(data.stdout!.split("\n")).toHaveLength(50);
    expect(data.stderr).toBe("error line 1\nerror line 2");

    // Custom lines
    const result10 = parsePayload(
      await tool.execute("1", { action: "logs", id: "my-job", lines: 10 } as any),
    );
    const data10 = result10.data as { stdout: string | null; lines: number };
    expect(data10.lines).toBe(10);
    expect(data10.stdout!.split("\n")).toHaveLength(10);
  });

  it("returns null for missing log files", async () => {
    const baseDir = await makeTempDir();
    const nsDir = path.join(baseDir, "test.ns", "no-logs");
    await fs.mkdir(nsDir, { recursive: true });

    const api = {
      pluginConfig: { defaultBackend: "launchd", namespace: "test.ns", dataDir: baseDir },
      logger: {},
    } as any;

    const tool = createNativeSchedulerTool(api);
    const result = parsePayload(await tool.execute("1", { action: "logs", id: "no-logs" } as any));
    expect(result.ok).toBe(true);
    const data = result.data as { stdout: string | null; stderr: string | null };
    expect(data.stdout).toBeNull();
    expect(data.stderr).toBeNull();
  });

  it("logs action requires id", async () => {
    const api = {
      pluginConfig: { defaultBackend: "launchd" },
      logger: {},
    } as any;

    const tool = createNativeSchedulerTool(api);
    const result = parsePayload(await tool.execute("1", { action: "logs" } as any));
    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain("id is required");
  });

  it("clamps lines parameter to valid range", async () => {
    const baseDir = await makeTempDir();
    const nsDir = path.join(baseDir, "test.ns", "clamp-job");
    await fs.mkdir(nsDir, { recursive: true });

    const api = {
      pluginConfig: { defaultBackend: "launchd", namespace: "test.ns", dataDir: baseDir },
      logger: {},
    } as any;

    const tool = createNativeSchedulerTool(api);

    // Lines above max should be clamped to 500
    const result = parsePayload(
      await tool.execute("1", { action: "logs", id: "clamp-job", lines: 9999 } as any),
    );
    expect(result.ok).toBe(true);
    expect((result.data as { lines: number }).lines).toBe(500);
  });
});
