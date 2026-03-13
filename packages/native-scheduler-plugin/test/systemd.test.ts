import { describe, expect, it, vi } from "vitest";
import {
  buildLabel,
  createSystemdAdapter,
  renderServiceUnit,
  renderTimerUnit,
  type SystemdJobInput,
  sanitizeSegment,
} from "../src/systemd.js";

describe("systemd helpers", () => {
  it("sanitizes label segments", () => {
    expect(sanitizeSegment("  Hello World! ")).toBe("hello-world");
    expect(sanitizeSegment("../../etc/passwd")).toBe("..-..-etc-passwd");
  });

  it("builds labels and rejects empty results", () => {
    expect(buildLabel("Dev.App", "Job_1")).toBe("dev.app-job_1");
    expect(() => buildLabel("***", "job")).toThrow(/empty systemd label prefix/);
    expect(() => buildLabel("ns", "***")).toThrow(/empty systemd label suffix/);
  });

  it("renders service unit with environment", () => {
    const job: SystemdJobInput = {
      id: "test-job",
      command: ["/usr/bin/echo", "hello world"],
      environment: { FOO: "bar", SECRET: 'a"b' },
      workingDirectory: "/tmp",
    };
    const unit = renderServiceUnit("dev.ns-test-job", job);
    expect(unit).toContain("Type=oneshot");
    expect(unit).toContain('ExecStart="/usr/bin/echo" "hello world"');
    expect(unit).toContain('Environment="FOO=bar"');
    expect(unit).toContain('Environment="SECRET=a\\"b"');
    expect(unit).toContain("WorkingDirectory=/tmp");
  });

  it("renders timer unit with interval", () => {
    const job: SystemdJobInput = {
      id: "test-job",
      command: ["/usr/bin/true"],
      startIntervalSeconds: 600,
    };
    const unit = renderTimerUnit("dev.ns-test-job", job);
    expect(unit).toContain("OnBootSec=600s");
    expect(unit).toContain("OnUnitActiveSec=600s");
    expect(unit).toContain("Unit=dev.ns-test-job.service");
    expect(unit).toContain("WantedBy=timers.target");
  });
});

const describeOnLinux = process.platform === "linux" ? describe : describe.skip;

describeOnLinux("createSystemdAdapter", () => {
  it("constructs systemctl calls for upsert/remove/run/enable/disable", async () => {
    const commands: string[][] = [];
    const files = new Map<string, string>();

    const fsMock = {
      mkdir: vi.fn(async () => undefined),
      readdir: vi.fn(async () => []),
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

    const execSystemctl = vi.fn(async (args: string[]) => {
      commands.push(args);
      if (args[0] === "list-timers") {
        return {
          code: 0,
          stdout:
            "NEXT  LEFT  LAST  PASSED  UNIT  ACTIVATES\nn/a   n/a   n/a   n/a     dev.ns-job-one.timer  dev.ns-job-one.service\n\n1 timers listed.",
          stderr: "",
        };
      }
      return { code: 0, stdout: "", stderr: "" };
    });

    const adapter = createSystemdAdapter({
      namespace: "Dev.NS",
      deps: {
        platform: "linux",
        homedir: () => "/home/test",
        fs: fsMock,
        execSystemctl,
      },
    });

    await adapter.upsert({ id: "Job One", command: ["/bin/echo", "ok"] });
    await adapter.run("Job One");
    await adapter.enable("Job One");
    await adapter.disable("Job One");
    await adapter.list();
    await adapter.remove("Job One");

    const servicePath = "/home/test/.config/systemd/user/dev.ns-job-one.service";
    const timerPath = "/home/test/.config/systemd/user/dev.ns-job-one.timer";

    expect(fsMock.writeFile).toHaveBeenCalledWith(
      servicePath,
      expect.stringContaining("ExecStart"),
      "utf8",
    );
    expect(fsMock.writeFile).toHaveBeenCalledWith(
      timerPath,
      expect.stringContaining("OnUnitActiveSec"),
      "utf8",
    );
    expect(commands).toContainEqual(["daemon-reload"]);
    expect(commands).toContainEqual(["enable", "--now", "dev.ns-job-one.timer"]);
    expect(commands).toContainEqual(["start", "dev.ns-job-one.service"]);
    expect(commands).toContainEqual(["enable", "dev.ns-job-one.timer"]);
    expect(commands).toContainEqual(["disable", "dev.ns-job-one.timer"]);
    expect(commands).toContainEqual(["stop", "dev.ns-job-one.timer"]);
    expect(fsMock.rm).toHaveBeenCalledWith(servicePath, { force: true });
    expect(fsMock.rm).toHaveBeenCalledWith(timerPath, { force: true });
  });

  it("keeps unit file paths in systemd user dir even with traversal-like ids", async () => {
    const fsMock = {
      mkdir: vi.fn(async () => undefined),
      readdir: vi.fn(async () => []),
      writeFile: vi.fn(async () => undefined),
      rm: vi.fn(async () => undefined),
      access: vi.fn(async () => undefined),
    };

    const execSystemctl = vi.fn(async () => ({ code: 0, stdout: "", stderr: "" }));

    const adapter = createSystemdAdapter({
      namespace: "dev.ns",
      deps: {
        platform: "linux",
        homedir: () => "/home/test",
        fs: fsMock,
        execSystemctl,
      },
    });

    const result = await adapter.upsert({ id: "../../danger", command: ["/usr/bin/true"] });
    expect(result.servicePath.startsWith("/home/test/.config/systemd/user/")).toBe(true);
    expect(result.servicePath.includes("../")).toBe(false);
    expect(result.timerPath.startsWith("/home/test/.config/systemd/user/")).toBe(true);
    expect(result.timerPath.includes("../")).toBe(false);
  });

  it("throws on non-linux platform", () => {
    expect(() =>
      createSystemdAdapter({
        namespace: "test",
        deps: { platform: "darwin" },
      }),
    ).toThrow(/only available on Linux/);
  });
});
