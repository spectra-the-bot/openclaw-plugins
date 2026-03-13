import { describe, expect, it, vi } from "vitest";
import { buildTaskName, createWintaskAdapter, sanitizeSegment } from "../src/wintask.js";

describe("wintask helpers", () => {
  it("sanitizes label segments", () => {
    expect(sanitizeSegment("  Hello World! ")).toBe("hello-world");
    expect(sanitizeSegment("../../etc/passwd")).toBe("..-..-etc-passwd");
  });

  it("builds task names and rejects empty results", () => {
    expect(buildTaskName("Dev.App", "Job_1")).toBe("\\NativeScheduler\\dev.app\\job_1");
    expect(() => buildTaskName("***", "job")).toThrow(/empty task name prefix/);
    expect(() => buildTaskName("ns", "***")).toThrow(/empty task name suffix/);
  });
});

const describeOnWindows = process.platform === "win32" ? describe : describe.skip;

describeOnWindows("createWintaskAdapter", () => {
  it("constructs schtasks calls for upsert/remove/run/enable/disable", async () => {
    const commands: string[][] = [];

    const execSchtasks = vi.fn(async (args: string[]) => {
      commands.push(args);
      if (args[0] === "/Query" && args.includes("/NH")) {
        return {
          code: 0,
          stdout: '"\\NativeScheduler\\dev.ns\\job-one","N/A","Ready"\n',
          stderr: "",
        };
      }
      return { code: 0, stdout: "", stderr: "" };
    });

    const adapter = createWintaskAdapter({
      namespace: "Dev.NS",
      deps: {
        platform: "win32",
        execSchtasks,
      },
    });

    // Upsert
    const upsertResult = await adapter.upsert({
      id: "Job One",
      command: ["C:\\bin\\echo.exe", "ok"],
      startIntervalSeconds: 300,
    });
    expect(upsertResult.changed).toBe(true);
    expect(upsertResult.taskName).toBe("\\NativeScheduler\\dev.ns\\job-one");
    expect(commands).toContainEqual(
      expect.arrayContaining(["/Create", "/F", "/SC", "MINUTE", "/MO", "5"]),
    );

    // Run
    await adapter.run("Job One");
    expect(commands).toContainEqual(["/Run", "/TN", "\\NativeScheduler\\dev.ns\\job-one"]);

    // Enable
    await adapter.enable("Job One");
    expect(commands).toContainEqual([
      "/Change",
      "/TN",
      "\\NativeScheduler\\dev.ns\\job-one",
      "/ENABLE",
    ]);

    // Disable
    await adapter.disable("Job One");
    expect(commands).toContainEqual([
      "/Change",
      "/TN",
      "\\NativeScheduler\\dev.ns\\job-one",
      "/DISABLE",
    ]);

    // List
    const listResult = await adapter.list();
    expect(listResult.jobs).toHaveLength(1);
    expect(listResult.jobs[0]!.id).toBe("job-one");

    // Remove
    await adapter.remove("Job One");
    expect(commands).toContainEqual(["/Delete", "/F", "/TN", "\\NativeScheduler\\dev.ns\\job-one"]);
  });

  it("keeps task names safe from traversal-like ids", () => {
    const taskName = buildTaskName("dev.ns", "../../danger");
    expect(taskName).toBe("\\NativeScheduler\\dev.ns\\..-..-danger");
    expect(taskName.includes("../")).toBe(false);
  });
});

describe("wintask platform guard", () => {
  it("throws on non-windows platform", () => {
    expect(() =>
      createWintaskAdapter({
        namespace: "test",
        deps: { platform: "linux" },
      }),
    ).toThrow(/only available on Windows/);
  });
});
