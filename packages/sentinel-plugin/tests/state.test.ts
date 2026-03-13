import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadState, mergeState, saveState } from "../src/stateStore.js";

describe("state restore/merge", () => {
  it("merges runtime and watcher records by id", () => {
    const a = {
      watchers: [{ id: "w1" }],
      runtime: { w1: { id: "w1", consecutiveFailures: 1 } },
      updatedAt: "",
    } as any;
    const b = {
      watchers: [{ id: "w2" }, { id: "w1", enabled: false }],
      runtime: { w2: { id: "w2", consecutiveFailures: 0 } },
      updatedAt: "",
    } as any;
    const merged = mergeState(a, b);
    expect(merged.watchers.find((w: any) => w.id === "w1")?.enabled).toBe(false);
    expect(merged.runtime.w2.id).toBe("w2");
  });
});

describe("loadState", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sentinel-state-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns empty state when file does not exist (ENOENT)", async () => {
    const result = await loadState(path.join(tmpDir, "nonexistent.json"));
    expect(result.watchers).toEqual([]);
    expect(result.runtime).toEqual({});
    expect(result.updatedAt).toBeTruthy();
  });

  it("throws on corrupt/malformed JSON", async () => {
    const filePath = path.join(tmpDir, "corrupt.json");
    await fs.writeFile(filePath, "{ not valid json !!");
    await expect(loadState(filePath)).rejects.toThrow();
  });

  it.skipIf(process.platform === "win32")("throws on permission error (EACCES)", async () => {
    const filePath = path.join(tmpDir, "noperm.json");
    await fs.writeFile(filePath, JSON.stringify({ watchers: [], runtime: {} }));
    await fs.chmod(filePath, 0o000);
    await expect(loadState(filePath)).rejects.toThrow();
    // Restore permissions so cleanup works
    await fs.chmod(filePath, 0o600);
  });

  it("loads valid state correctly", async () => {
    const filePath = path.join(tmpDir, "valid.json");
    const state = {
      watchers: [{ id: "w1", enabled: true }],
      runtime: { w1: { id: "w1", consecutiveFailures: 0 } },
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await fs.writeFile(filePath, JSON.stringify(state));
    const result = await loadState(filePath);
    expect(result.watchers).toHaveLength(1);
    expect(result.watchers[0].id).toBe("w1");
    expect(result.runtime.w1.id).toBe("w1");
    expect(result.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("saveState (atomic write)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sentinel-state-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("writes via tmp file and renames atomically", async () => {
    const filePath = path.join(tmpDir, "state.json");
    const watchers = [{ id: "w1", enabled: true }] as any[];
    const runtime = { w1: { id: "w1", consecutiveFailures: 0 } } as any;

    await saveState(filePath, watchers, runtime);

    // Final file should exist and be valid JSON
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.watchers).toHaveLength(1);
    expect(parsed.watchers[0].id).toBe("w1");
    expect(parsed.updatedAt).toBeTruthy();

    // No leftover .tmp files in the directory
    const files = await fs.readdir(tmpDir);
    const tmpFiles = files.filter((f) => f.endsWith(".tmp"));
    expect(tmpFiles).toHaveLength(0);
  });

  it("creates parent directories if they don't exist", async () => {
    const filePath = path.join(tmpDir, "nested", "deep", "state.json");
    await saveState(filePath, [], {});
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.watchers).toEqual([]);
  });
});
