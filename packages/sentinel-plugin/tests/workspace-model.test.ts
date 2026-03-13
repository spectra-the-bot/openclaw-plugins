import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultStatePath } from "../src/stateStore.js";
import { resolveOpenClawStateDir } from "../src/utils.js";
import { validateWatcherDefinition } from "../src/validator.js";
import { readOperatorGoalFile, resolveDataDir, WatcherManager } from "../src/watcherManager.js";

const TEST_DIR = path.join(
  os.tmpdir(),
  `sentinel-workspace-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
);

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
  // Clean env
  delete process.env.OPENCLAW_STATE_DIR;
  delete process.env.CLAWDBOT_STATE_DIR;
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
  delete process.env.OPENCLAW_STATE_DIR;
  delete process.env.CLAWDBOT_STATE_DIR;
});

const base = {
  id: "w1",
  skillId: "skill.a",
  enabled: true,
  strategy: "http-poll",
  endpoint: "https://api.github.com/events",
  match: "all",
  conditions: [{ path: "a", op: "exists" }],
  fire: {
    webhookPath: "/internal/sentinel",
    eventName: "x",
    payloadTemplate: { a: "${payload.a}" },
  },
  retry: { maxRetries: 3, baseMs: 100, maxMs: 2000 },
};

describe("resolveOpenClawStateDir", () => {
  it("defaults to ~/.openclaw when no env vars set", () => {
    const result = resolveOpenClawStateDir();
    expect(result).toBe(path.join(os.homedir(), ".openclaw"));
  });

  it("respects OPENCLAW_STATE_DIR env var", () => {
    process.env.OPENCLAW_STATE_DIR = "/custom/state";
    expect(resolveOpenClawStateDir()).toBe("/custom/state");
  });

  it("respects CLAWDBOT_STATE_DIR as legacy fallback", () => {
    process.env.CLAWDBOT_STATE_DIR = "/legacy/state";
    expect(resolveOpenClawStateDir()).toBe("/legacy/state");
  });

  it("prefers OPENCLAW_STATE_DIR over CLAWDBOT_STATE_DIR", () => {
    process.env.OPENCLAW_STATE_DIR = "/preferred";
    process.env.CLAWDBOT_STATE_DIR = "/legacy";
    expect(resolveOpenClawStateDir()).toBe("/preferred");
  });

  it("ignores blank OPENCLAW_STATE_DIR", () => {
    process.env.OPENCLAW_STATE_DIR = "  ";
    expect(resolveOpenClawStateDir()).toBe(path.join(os.homedir(), ".openclaw"));
  });
});

describe("resolveDataDir", () => {
  it("uses config.dataDir when provided", () => {
    const dir = resolveDataDir({ dataDir: "/my/data" } as any);
    expect(dir).toBe("/my/data");
  });

  it("falls back to OPENCLAW_STATE_DIR/data/sentinel", () => {
    process.env.OPENCLAW_STATE_DIR = "/custom";
    const dir = resolveDataDir({} as any);
    expect(dir).toBe(path.join("/custom", "data", "sentinel"));
  });

  it("falls back to ~/.openclaw/data/sentinel by default", () => {
    const dir = resolveDataDir({} as any);
    expect(dir).toBe(path.join(os.homedir(), ".openclaw", "data", "sentinel"));
  });
});

describe("defaultStatePath", () => {
  it("uses dataDir when provided", () => {
    const result = defaultStatePath("/my/data");
    expect(result).toBe(path.join("/my/data", "state.json"));
  });

  it("falls back to resolveOpenClawStateDir when no dataDir", () => {
    process.env.OPENCLAW_STATE_DIR = "/custom";
    const result = defaultStatePath();
    expect(result).toBe(path.join("/custom", "data", "sentinel", "state.json"));
  });
});

describe("operatorGoalFile validation", () => {
  it("rejects absolute paths starting with /", () => {
    expect(() =>
      validateWatcherDefinition({
        ...base,
        fire: { ...base.fire, operatorGoalFile: "/etc/passwd" },
      }),
    ).toThrow();
  });

  it("rejects paths starting with ~", () => {
    expect(() =>
      validateWatcherDefinition({
        ...base,
        fire: { ...base.fire, operatorGoalFile: "~/secret" },
      }),
    ).toThrow();
  });

  it("rejects .. traversal at start", () => {
    expect(() =>
      validateWatcherDefinition({
        ...base,
        fire: { ...base.fire, operatorGoalFile: "../escape" },
      }),
    ).toThrow();
  });

  it("rejects .. traversal in middle", () => {
    expect(() =>
      validateWatcherDefinition({
        ...base,
        fire: { ...base.fire, operatorGoalFile: "sub/../../../escape" },
      }),
    ).toThrow();
  });

  it("rejects trailing .. component", () => {
    expect(() =>
      validateWatcherDefinition({
        ...base,
        fire: { ...base.fire, operatorGoalFile: "sub/.." },
      }),
    ).toThrow();
  });

  it("accepts valid relative path", () => {
    const watcher = validateWatcherDefinition({
      ...base,
      fire: { ...base.fire, operatorGoalFile: "my-policy.md" },
    });
    expect(watcher.fire.operatorGoalFile).toBe("my-policy.md");
  });

  it("accepts nested relative path", () => {
    const watcher = validateWatcherDefinition({
      ...base,
      fire: { ...base.fire, operatorGoalFile: "shared/common-policy.md" },
    });
    expect(watcher.fire.operatorGoalFile).toBe("shared/common-policy.md");
  });
});

describe("readOperatorGoalFile", () => {
  it("reads a file within the operator-goals directory", async () => {
    const dataDir = path.join(TEST_DIR, "data");
    const goalsDir = path.join(dataDir, "operator-goals");
    await mkdir(goalsDir, { recursive: true });
    await writeFile(path.join(goalsDir, "policy.md"), "Follow the rules");

    const result = await readOperatorGoalFile("policy.md", dataDir, 12000);
    expect(result).toBe("Follow the rules");
  });

  it("rejects static traversal", async () => {
    const dataDir = path.join(TEST_DIR, "data");
    const goalsDir = path.join(dataDir, "operator-goals");
    await mkdir(goalsDir, { recursive: true });

    const warnings: string[] = [];
    const logger = { warn: (msg: string) => warnings.push(msg) };

    const result = await readOperatorGoalFile("../../etc/passwd", dataDir, 12000, logger as any);
    expect(result).toBeUndefined();
    expect(warnings.some((w) => w.includes("escapes workspace"))).toBe(true);
  });

  it("rejects symlink traversal", async () => {
    const dataDir = path.join(TEST_DIR, "data");
    const goalsDir = path.join(dataDir, "operator-goals");
    await mkdir(goalsDir, { recursive: true });

    // Create a file outside the goals dir
    const outsideFile = path.join(TEST_DIR, "secret.txt");
    await writeFile(outsideFile, "secret content");

    // Create symlink inside goals dir pointing outside
    await symlink(outsideFile, path.join(goalsDir, "evil-link.md"));

    const warnings: string[] = [];
    const logger = { warn: (msg: string) => warnings.push(msg) };

    const result = await readOperatorGoalFile("evil-link.md", dataDir, 12000, logger as any);
    expect(result).toBeUndefined();
    expect(warnings.some((w) => w.includes("symlink escapes workspace"))).toBe(true);
  });

  it("truncates files exceeding maxChars", async () => {
    const dataDir = path.join(TEST_DIR, "data");
    const goalsDir = path.join(dataDir, "operator-goals");
    await mkdir(goalsDir, { recursive: true });
    await writeFile(path.join(goalsDir, "big.md"), "x".repeat(200));

    const warnings: string[] = [];
    const logger = { warn: (msg: string) => warnings.push(msg) };

    const result = await readOperatorGoalFile("big.md", dataDir, 50, logger as any);
    expect(result).toHaveLength(50);
    expect(warnings.some((w) => w.includes("truncated"))).toBe(true);
  });

  it("returns undefined for missing file", async () => {
    const dataDir = path.join(TEST_DIR, "data");
    const goalsDir = path.join(dataDir, "operator-goals");
    await mkdir(goalsDir, { recursive: true });

    const warnings: string[] = [];
    const logger = { warn: (msg: string) => warnings.push(msg) };

    const result = await readOperatorGoalFile("missing.md", dataDir, 12000, logger as any);
    expect(result).toBeUndefined();
  });
});

describe("operatorGoalContent", () => {
  function buildManager(dataDirOverride: string) {
    const dispatched: Array<{ path: string; body: Record<string, unknown> }> = [];
    const manager = new WatcherManager(
      {
        allowedHosts: ["api.github.com"],
        localDispatchBase: "http://127.0.0.1:18789",
        dataDir: dataDirOverride,
        stateFilePath: path.join(TEST_DIR, `state-${Math.random().toString(36).slice(2)}.json`),
        limits: {
          maxWatchersTotal: 20,
          maxWatchersPerSkill: 20,
          maxConditionsPerWatcher: 25,
          maxIntervalMsFloor: 1,
        },
      },
      {
        async dispatch(p, body) {
          dispatched.push({ path: p, body });
        },
      },
    );
    return { manager, dispatched };
  }

  it("manager resolvedDataDir uses config.dataDir", () => {
    const dataDir = path.join(TEST_DIR, "custom-data");
    const { manager } = buildManager(dataDir);
    expect(manager.resolvedDataDir).toBe(dataDir);
  });
});
