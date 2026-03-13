import { describe, expect, it, vi } from "vitest";
import {
  buildLabel,
  createLaunchdAdapter,
  renderPlist,
  sanitizeSegment,
  type LaunchdJobInput,
} from "../src/launchd.js";

function dirent(name: string) {
  return {
    name,
    isFile: () => true,
    isDirectory: () => false,
  };
}

describe("launchd helpers", () => {
  it("sanitizes label segments", () => {
    expect(sanitizeSegment("  Hello World! ")).toBe("hello-world");
    expect(sanitizeSegment("../../etc/passwd")).toBe("..-..-etc-passwd");
  });

  it("builds labels and rejects empty results", () => {
    expect(buildLabel("Dev.App", "Job_1")).toBe("dev.app.job_1");
    expect(() => buildLabel("***", "job")).toThrow(/empty launchd label prefix/);
    expect(() => buildLabel("ns", "***")).toThrow(/empty launchd label suffix/);
  });

  it("renders plist with escaped env and calendar", () => {
    const job: LaunchdJobInput = {
      id: "job",
      command: ["/bin/echo", "hello"],
      environment: { SECRET: "a&<>'\"b" },
      calendar: [{ minute: 5, hour: 2 }],
      startIntervalSeconds: 10,
      runAtLoad: true,
      disabled: false,
    };

    const plist = renderPlist("dev.test.job", job);
    expect(plist).toContain("<key>ProgramArguments</key>");
    expect(plist).toContain("<key>StartCalendarInterval</key>");
    expect(plist).toContain("a&amp;&lt;&gt;&apos;&quot;b");
    expect(plist).toContain("<key>Disabled</key><false/>");
  });
});

const describeOnMac = process.platform === "darwin" ? describe : describe.skip;

describeOnMac("createLaunchdAdapter", () => {
  it("constructs launchctl calls for upsert/remove/run/enable/disable", async () => {
    const commands: string[][] = [];
    const files = new Map<string, string>();

    const fsMock = {
      mkdir: vi.fn(async () => undefined),
      readdir: vi.fn(async () => [dirent("dev.ns.job-one.plist")]),
      writeFile: vi.fn(async (filePath: string, content: string) => {
        files.set(filePath, content);
      }),
      rm: vi.fn(async (filePath: string) => {
        files.delete(filePath);
      }),
      access: vi.fn(async (filePath: string) => {
        if (!files.has(filePath)) {
          const err = new Error("ENOENT") as Error & { code?: string };
          err.code = "ENOENT";
          throw err;
        }
      }),
    };

    const execLaunchctl = vi.fn(async (args: string[]) => {
      commands.push(args);

      if (args[0] === "print") {
        return { code: 0, stdout: "service = running", stderr: "" };
      }
      if (args[0] === "print-disabled") {
        return { code: 0, stdout: '"dev.ns.job-one" = false;', stderr: "" };
      }
      if (args[0] === "bootout") {
        return { code: 0, stdout: "", stderr: "" };
      }
      if (args[0] === "bootstrap") {
        return { code: 0, stdout: "", stderr: "" };
      }
      if (args[0] === "kickstart") {
        return { code: 0, stdout: "", stderr: "" };
      }
      if (args[0] === "enable" || args[0] === "disable") {
        return { code: 0, stdout: "", stderr: "" };
      }
      return { code: 0, stdout: "", stderr: "" };
    });

    const adapter = createLaunchdAdapter({
      namespace: "Dev.NS",
      deps: {
        platform: "darwin",
        getuid: () => 501,
        homedir: () => "/Users/test",
        fs: fsMock,
        execLaunchctl,
      },
    });

    await adapter.upsert({ id: "Job One", command: ["/bin/echo", "ok"] });
    await adapter.run("Job One");
    await adapter.enable("Job One");
    await adapter.disable("Job One");
    await adapter.list();
    await adapter.remove("Job One");

    const plistPath = "/Users/test/Library/LaunchAgents/dev.ns.job-one.plist";
    expect(fsMock.writeFile).toHaveBeenCalledWith(
      plistPath,
      expect.stringContaining("ProgramArguments"),
      "utf8",
    );
    expect(commands).toContainEqual(["bootstrap", "gui/501", plistPath]);
    expect(commands).toContainEqual(["kickstart", "-k", "gui/501/dev.ns.job-one"]);
    expect(commands).toContainEqual(["enable", "gui/501/dev.ns.job-one"]);
    expect(commands).toContainEqual(["disable", "gui/501/dev.ns.job-one"]);
    expect(fsMock.rm).toHaveBeenCalledWith(plistPath, { force: true });
  });

  it("keeps plist path in LaunchAgents even with traversal-like ids", async () => {
    const fsMock = {
      mkdir: vi.fn(async () => undefined),
      readdir: vi.fn(async () => []),
      writeFile: vi.fn(async () => undefined),
      rm: vi.fn(async () => undefined),
      access: vi.fn(async () => undefined),
    };

    const execLaunchctl = vi.fn(async (args: string[]) => {
      if (args[0] === "print") return { code: 1, stdout: "", stderr: "not found" };
      return { code: 0, stdout: "", stderr: "" };
    });

    const adapter = createLaunchdAdapter({
      namespace: "dev.ns",
      deps: {
        platform: "darwin",
        getuid: () => 501,
        homedir: () => "/Users/test",
        fs: fsMock,
        execLaunchctl,
      },
    });

    const result = await adapter.upsert({ id: "../../danger", command: ["/usr/bin/true"] });
    expect(result.filePath.startsWith("/Users/test/Library/LaunchAgents/")).toBe(true);
    expect(result.filePath.includes("../")).toBe(false);
  });
});
