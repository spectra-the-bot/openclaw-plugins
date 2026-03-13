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
  it("reports unimplemented backend for non-launchd actions", async () => {
    const api = {
      pluginConfig: { defaultBackend: "systemd" },
      logger: {},
    } as any;
    const tool = createNativeSchedulerTool(api);
    const output = parsePayload(await tool.execute("1", { action: "list" } as any));
    expect(output.ok).toBe(false);
    expect(String(output.error)).toContain("not implemented");
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
    if (process.platform === "darwin") {
      expect(String(upsert.error)).toContain("job is required");
    } else {
      // On non-macOS, launchd adapter throws before reaching job validation
      expect(String(upsert.error)).toContain("launchd adapter is only available on macOS");
    }

    const failures = parsePayload(await tool.execute("1", { action: "failures" } as any));
    expect(failures.ok).toBe(false);
    if (process.platform === "darwin") {
      expect(String(failures.error)).toContain("id is required");
    } else {
      expect(String(failures.error)).toContain("launchd adapter is only available on macOS");
    }
  });
});
