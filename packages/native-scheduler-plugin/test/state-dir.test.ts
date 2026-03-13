import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDefaultDataDir, resolveOpenClawStateDir } from "../src/status.js";

beforeEach(() => {
  delete process.env.OPENCLAW_STATE_DIR;
  delete process.env.CLAWDBOT_STATE_DIR;
});

afterEach(() => {
  delete process.env.OPENCLAW_STATE_DIR;
  delete process.env.CLAWDBOT_STATE_DIR;
});

describe("resolveOpenClawStateDir", () => {
  it("defaults to ~/.openclaw when no env vars set", () => {
    expect(resolveOpenClawStateDir()).toBe(path.join(os.homedir(), ".openclaw"));
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
});

describe("getDefaultDataDir", () => {
  it("resolves from OPENCLAW_STATE_DIR", () => {
    process.env.OPENCLAW_STATE_DIR = "/custom";
    expect(getDefaultDataDir()).toBe(path.join("/custom", "data", "native-scheduler"));
  });

  it("defaults to ~/.openclaw/data/native-scheduler", () => {
    expect(getDefaultDataDir()).toBe(
      path.join(os.homedir(), ".openclaw", "data", "native-scheduler"),
    );
  });
});
