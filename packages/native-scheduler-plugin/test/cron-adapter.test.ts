import { describe, expect, it, vi } from "vitest";
import {
  buildSentinel,
  createCronAdapter,
  intervalToCron,
  sanitizeSegment,
} from "../src/cron-adapter.js";

describe("cron-adapter helpers", () => {
  it("sanitizes label segments", () => {
    expect(sanitizeSegment("  Hello World! ")).toBe("hello-world");
    expect(sanitizeSegment("../../etc/passwd")).toBe("..-..-etc-passwd");
  });

  it("builds sentinel comments and rejects empty results", () => {
    expect(buildSentinel("Dev.App", "Job_1")).toBe("# native-scheduler:dev.app:job_1");
    expect(() => buildSentinel("***", "job")).toThrow(/empty cron sentinel prefix/);
    expect(() => buildSentinel("ns", "***")).toThrow(/empty cron sentinel suffix/);
  });

  it("converts intervals to cron expressions", () => {
    expect(intervalToCron(undefined)).toBe("@reboot");
    expect(intervalToCron(30)).toBe("* * * * *");
    expect(intervalToCron(300)).toBe("*/5 * * * *");
    expect(intervalToCron(3600)).toBe("0 */1 * * *");
    expect(intervalToCron(7200)).toBe("0 */2 * * *");
    expect(intervalToCron(86400)).toBe("0 0 * * *");
    expect(intervalToCron(172800)).toBe("0 0 * * *");
  });
});

const describeNotWindows = process.platform !== "win32" ? describe : describe.skip;

describeNotWindows("createCronAdapter", () => {
  it("constructs crontab calls for upsert/remove/run/enable/disable", async () => {
    let currentCrontab = "";

    const execCrontab = vi.fn(async (args: string[], stdin?: string) => {
      if (args[0] === "-l") {
        return { code: 0, stdout: currentCrontab, stderr: "" };
      }
      if (args[0] === "-") {
        currentCrontab = stdin ?? "";
        return { code: 0, stdout: "", stderr: "" };
      }
      return { code: 0, stdout: "", stderr: "" };
    });

    const spawnDirect = vi.fn(async () => ({ code: 0 }));

    const adapter = createCronAdapter({
      namespace: "Dev.NS",
      deps: {
        platform: "linux",
        execCrontab,
        spawnDirect,
      },
    });

    // Upsert
    const upsertResult = await adapter.upsert({
      id: "Job One",
      command: ["/bin/echo", "hello"],
      startIntervalSeconds: 300,
    });
    expect(upsertResult.changed).toBe(true);
    expect(upsertResult.sentinel).toBe("# native-scheduler:dev.ns:job-one");
    expect(upsertResult.cronLine).toContain("*/5 * * * *");
    expect(currentCrontab).toContain("# native-scheduler:dev.ns:job-one");
    expect(currentCrontab).toContain("*/5 * * * * /bin/echo hello");

    // List
    const listResult = await adapter.list();
    expect(listResult.jobs).toHaveLength(1);
    expect(listResult.jobs[0]!.id).toBe("job-one");

    // Get
    const getResult = await adapter.get("Job One");
    expect(getResult.exists).toBe(true);
    expect(getResult.cronLine).toContain("*/5 * * * *");

    // Run
    await adapter.run("Job One");
    expect(spawnDirect).toHaveBeenCalledWith(["sh", "-c", "/bin/echo hello"]);

    // Disable
    await adapter.disable("Job One");
    expect(currentCrontab).toContain("#DISABLED */5 * * * *");

    // Enable
    await adapter.enable("Job One");
    expect(currentCrontab).not.toContain("#DISABLED");
    expect(currentCrontab).toContain("*/5 * * * *");

    // Remove
    const removeResult = await adapter.remove("Job One");
    expect(removeResult.removed).toBe(true);
    expect(currentCrontab).not.toContain("native-scheduler");
  });

  it("handles upsert replacing existing entry", async () => {
    let currentCrontab =
      "# existing line\n0 * * * * /bin/existing\n# native-scheduler:dev.ns:myjob\n*/10 * * * * /bin/old\n";

    const execCrontab = vi.fn(async (args: string[], stdin?: string) => {
      if (args[0] === "-l") return { code: 0, stdout: currentCrontab, stderr: "" };
      if (args[0] === "-") {
        currentCrontab = stdin ?? "";
        return { code: 0, stdout: "", stderr: "" };
      }
      return { code: 0, stdout: "", stderr: "" };
    });

    const adapter = createCronAdapter({
      namespace: "Dev.NS",
      deps: {
        platform: "linux",
        execCrontab,
        spawnDirect: vi.fn(async () => ({ code: 0 })),
      },
    });

    await adapter.upsert({
      id: "myjob",
      command: ["/bin/new"],
      startIntervalSeconds: 600,
    });

    expect(currentCrontab).toContain("# existing line");
    expect(currentCrontab).toContain("/bin/existing");
    expect(currentCrontab).not.toContain("/bin/old");
    expect(currentCrontab).toContain("*/10 * * * * /bin/new");
  });

  it("handles empty crontab (no crontab for user)", async () => {
    const execCrontab = vi.fn(async (args: string[], stdin?: string) => {
      if (args[0] === "-l") return { code: 1, stdout: "", stderr: "no crontab for user" };
      if (args[0] === "-") return { code: 0, stdout: "", stderr: "" };
      return { code: 0, stdout: "", stderr: "" };
    });

    const adapter = createCronAdapter({
      namespace: "ns",
      deps: {
        platform: "linux",
        execCrontab,
        spawnDirect: vi.fn(async () => ({ code: 0 })),
      },
    });

    const list = await adapter.list();
    expect(list.jobs).toHaveLength(0);
  });

  it("keeps sentinel safe from traversal-like ids", () => {
    const sentinel = buildSentinel("dev.ns", "../../danger");
    expect(sentinel).toBe("# native-scheduler:dev.ns:..-..-danger");
    expect(sentinel.includes("../")).toBe(false);
  });

  it("throws on windows platform", () => {
    expect(() =>
      createCronAdapter({
        namespace: "test",
        deps: { platform: "win32" },
      }),
    ).toThrow(/not available on Windows/);
  });
});
