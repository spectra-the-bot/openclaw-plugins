import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendRun,
  type JobRunStatus,
  listFailureRuns,
  migrateHealth,
  migrateRunStatus,
  nextHealth,
  readJsonIfExists,
  resolveJobPaths,
} from "../src/status.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "native-scheduler-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("status files", () => {
  it("resolves sanitized job paths", () => {
    const paths = resolveJobPaths("My NS", "Job/One", "/tmp/base");
    expect(paths.namespace).toBe("my-ns");
    expect(paths.jobId).toBe("job-one");
    expect(paths.rootDir).toBe(path.join("/tmp/base", "my-ns", "job-one"));
  });

  it("updates health counters", () => {
    const first: JobRunStatus = {
      version: 1,
      runId: "run-1",
      namespace: "ns",
      jobId: "job",
      backend: "launchd",
      command: ["/usr/bin/true"],
      startedAt: "2026-03-12T00:00:00.000Z",
      finishedAt: "2026-03-12T00:00:01.000Z",
      durationMs: 1000,
      success: false,
      exitCode: 1,
      signal: null,
    };

    const second = {
      ...first,
      runId: "run-2",
      finishedAt: "2026-03-12T00:00:03.000Z",
      success: true,
      exitCode: 0,
    };

    const health1 = nextHealth(undefined, first);
    const health2 = nextHealth(health1, second);

    expect(health1.totalRuns).toBe(1);
    expect(health1.totalFailures).toBe(1);
    expect(health1.consecutiveFailures).toBe(1);
    expect(health2.totalRuns).toBe(2);
    expect(health2.totalFailures).toBe(1);
    expect(health2.consecutiveFailures).toBe(0);
    expect(health2.lastSuccessAt).toBe(second.finishedAt);
  });

  it("persists run files and returns failure history", async () => {
    const baseDir = await makeTempDir();
    const paths = resolveJobPaths("ns", "job", baseDir);

    const failRun: JobRunStatus = {
      version: 1,
      runId: "2026-03-12-a",
      namespace: "ns",
      jobId: "job",
      backend: "launchd",
      command: ["/usr/bin/false"],
      startedAt: "2026-03-12T00:00:00.000Z",
      finishedAt: "2026-03-12T00:00:01.000Z",
      durationMs: 1000,
      success: false,
      exitCode: 2,
      signal: null,
    };

    const okRun: JobRunStatus = {
      ...failRun,
      runId: "2026-03-12-b",
      command: ["/usr/bin/true"],
      success: true,
      exitCode: 0,
      finishedAt: "2026-03-12T00:00:02.000Z",
    };

    await appendRun(paths, failRun);
    await appendRun(paths, okRun);

    const latest = await readJsonIfExists<JobRunStatus>(paths.latestPath);
    const failures = await listFailureRuns(paths, 10);

    expect(latest?.runId).toBe("2026-03-12-b");
    expect(failures).toHaveLength(1);
    expect(failures[0]?.runId).toBe("2026-03-12-a");
  });
});

describe("migrateRunStatus", () => {
  it("passes through version 1 as-is", () => {
    const v1 = {
      version: 1,
      runId: "run-1",
      namespace: "ns",
      jobId: "job",
      backend: "launchd",
      command: ["/usr/bin/true"],
      startedAt: "2026-03-12T00:00:00.000Z",
      finishedAt: "2026-03-12T00:00:01.000Z",
      durationMs: 1000,
      success: true,
      exitCode: 0,
      signal: null,
    };
    const result = migrateRunStatus(v1);
    expect(result).toBe(v1);
  });

  it("handles missing version with best-effort defaults", () => {
    const noVersion = { runId: "run-x", namespace: "ns", jobId: "j" };
    const result = migrateRunStatus(noVersion);
    expect(result.version).toBe(1);
    expect(result.runId).toBe("run-x");
    expect(result.namespace).toBe("ns");
    expect(result.jobId).toBe("j");
    expect(result.backend).toBe("launchd");
    expect(result.command).toEqual([]);
    expect(result.success).toBe(false);
  });

  it("handles unknown future version with best-effort mapping", () => {
    const v99 = {
      version: 99,
      runId: "run-future",
      namespace: "ns2",
      jobId: "j2",
      command: ["echo"],
      startedAt: "2030-01-01T00:00:00.000Z",
      finishedAt: "2030-01-01T00:00:01.000Z",
      durationMs: 500,
      success: true,
      exitCode: 0,
      signal: null,
      newField: "ignored",
    };
    const result = migrateRunStatus(v99);
    expect(result.version).toBe(1);
    expect(result.runId).toBe("run-future");
    expect(result.success).toBe(true);
  });

  it("throws for non-object input", () => {
    expect(() => migrateRunStatus(null)).toThrow("expected an object");
    expect(() => migrateRunStatus("string")).toThrow("expected an object");
  });
});

describe("migrateHealth", () => {
  it("passes through version 1 as-is", () => {
    const v1 = {
      version: 1,
      namespace: "ns",
      jobId: "job",
      backend: "launchd",
      totalRuns: 5,
      totalFailures: 1,
      consecutiveFailures: 0,
    };
    const result = migrateHealth(v1);
    expect(result).toBe(v1);
  });

  it("handles missing version with best-effort defaults", () => {
    const noVersion = { namespace: "ns", jobId: "j", totalRuns: 3 };
    const result = migrateHealth(noVersion);
    expect(result.version).toBe(1);
    expect(result.namespace).toBe("ns");
    expect(result.totalRuns).toBe(3);
    expect(result.totalFailures).toBe(0);
    expect(result.consecutiveFailures).toBe(0);
    expect(result.backend).toBe("launchd");
  });

  it("handles unknown future version with best-effort mapping", () => {
    const v99 = {
      version: 99,
      namespace: "ns",
      jobId: "j",
      totalRuns: 10,
      totalFailures: 2,
      consecutiveFailures: 1,
      lastRunId: "run-99",
      futureField: true,
    };
    const result = migrateHealth(v99);
    expect(result.version).toBe(1);
    expect(result.totalRuns).toBe(10);
    expect(result.lastRunId).toBe("run-99");
  });

  it("throws for non-object input", () => {
    expect(() => migrateHealth(null)).toThrow("expected an object");
    expect(() => migrateHealth(42)).toThrow("expected an object");
  });
});
