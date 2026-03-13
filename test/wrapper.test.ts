import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { readJsonIfExists, type JobHealth, type JobRunStatus } from "../src/status.js";
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
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command[0]!, command.slice(1), { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
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

    const code = await runCommand(wrapped.command);
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

    const code = await runCommand(wrapped.command);
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
});
