import { describe, expect, it, vi } from "vitest";
import {
  buildLabel,
  createLaunchdAdapter,
  FALLBACK_PATH,
  type LaunchdJobInput,
  renderPlist,
  resolveUserPath,
  sanitizeSegment,
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

  it("renders plist with PATH in EnvironmentVariables", () => {
    const job: LaunchdJobInput = {
      id: "job",
      command: ["/usr/bin/node", "script.js"],
      environment: { PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" },
    };

    const plist = renderPlist("dev.test.job", job);
    expect(plist).toContain("<key>EnvironmentVariables</key>");
    expect(plist).toContain("<key>PATH</key>");
    expect(plist).toContain(
      "<string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>",
    );
  });

  it("omits EnvironmentVariables when environment is undefined", () => {
    const job: LaunchdJobInput = {
      id: "job",
      command: ["/usr/bin/true"],
    };

    const plist = renderPlist("dev.test.job", job);
    expect(plist).not.toContain("<key>EnvironmentVariables</key>");
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

  it("includes EnvironmentVariables.PATH in plist when environment.PATH is set", async () => {
    const files = new Map<string, string>();

    const fsMock = {
      mkdir: vi.fn(async () => undefined),
      readdir: vi.fn(async () => []),
      writeFile: vi.fn(async (filePath: string, content: string) => {
        files.set(filePath, content);
      }),
      rm: vi.fn(async () => undefined),
      access: vi.fn(async () => {
        const err = new Error("ENOENT") as Error & { code?: string };
        err.code = "ENOENT";
        throw err;
      }),
    };

    const execLaunchctl = vi.fn(async (args: string[]) => {
      if (args[0] === "print") return { code: 1, stdout: "", stderr: "not found" };
      if (args[0] === "print-disabled") return { code: 0, stdout: "", stderr: "" };
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

    await adapter.upsert({
      id: "path-job",
      command: ["/usr/bin/node", "script.js"],
      environment: { PATH: "/opt/homebrew/bin:/usr/bin:/bin" },
    });

    const plistPath = "/Users/test/Library/LaunchAgents/dev.ns.path-job.plist";
    expect(fsMock.writeFile).toHaveBeenCalledWith(plistPath, expect.any(String), "utf8");

    const plistContent = files.get(plistPath)!;
    expect(plistContent).toContain("<key>EnvironmentVariables</key>");
    expect(plistContent).toContain("<key>PATH</key>");
    expect(plistContent).toContain(
      "<string>/opt/homebrew/bin:/usr/bin:/bin</string>",
    );
  });

  it("omits EnvironmentVariables from plist when no environment is set", async () => {
    const files = new Map<string, string>();

    const fsMock = {
      mkdir: vi.fn(async () => undefined),
      readdir: vi.fn(async () => []),
      writeFile: vi.fn(async (filePath: string, content: string) => {
        files.set(filePath, content);
      }),
      rm: vi.fn(async () => undefined),
      access: vi.fn(async () => {
        const err = new Error("ENOENT") as Error & { code?: string };
        err.code = "ENOENT";
        throw err;
      }),
    };

    const execLaunchctl = vi.fn(async (args: string[]) => {
      if (args[0] === "print") return { code: 1, stdout: "", stderr: "not found" };
      if (args[0] === "print-disabled") return { code: 0, stdout: "", stderr: "" };
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

    await adapter.upsert({
      id: "no-env-job",
      command: ["/usr/bin/true"],
    });

    const plistPath = "/Users/test/Library/LaunchAgents/dev.ns.no-env-job.plist";
    const plistContent = files.get(plistPath)!;
    expect(plistContent).not.toContain("<key>EnvironmentVariables</key>");
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

describe("resolveUserPath", () => {
  it("returns resolved PATH from login shell probe", async () => {
    const mockPath = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";
    const execProbe = vi.fn(async () => ({ code: 0, stdout: mockPath }));

    const result = await resolveUserPath({ execProbe, shell: "/bin/zsh" });
    expect(result).toBe(mockPath);
    expect(execProbe).toHaveBeenCalledWith(
      "/bin/zsh",
      ["-l", "-c", 'printf "%s" "$PATH"'],
      3_000,
    );
  });

  it("returns FALLBACK_PATH when probe exits non-zero", async () => {
    const execProbe = vi.fn(async () => ({ code: 1, stdout: "" }));

    const result = await resolveUserPath({ execProbe });
    expect(result).toBe(FALLBACK_PATH);
  });

  it("returns FALLBACK_PATH when probe returns empty stdout", async () => {
    const execProbe = vi.fn(async () => ({ code: 0, stdout: "  \n" }));

    const result = await resolveUserPath({ execProbe });
    expect(result).toBe(FALLBACK_PATH);
  });

  it("returns FALLBACK_PATH when probe throws (e.g. timeout)", async () => {
    const execProbe = vi.fn(async () => {
      throw new Error("spawn ENOENT");
    });

    const result = await resolveUserPath({ execProbe });
    expect(result).toBe(FALLBACK_PATH);
  });

  it("respects custom timeoutMs", async () => {
    const execProbe = vi.fn(async () => ({ code: 0, stdout: "/usr/bin:/bin" }));

    await resolveUserPath({ execProbe, timeoutMs: 500 });
    expect(execProbe).toHaveBeenCalledWith(expect.any(String), expect.any(Array), 500);
  });

  it("trims whitespace from probe output", async () => {
    const execProbe = vi.fn(async () => ({ code: 0, stdout: "  /usr/bin:/bin  \n" }));

    const result = await resolveUserPath({ execProbe });
    expect(result).toBe("/usr/bin:/bin");
  });
});
