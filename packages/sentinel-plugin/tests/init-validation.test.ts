import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WatcherManager } from "../src/watcherManager.js";

describe("init persisted watcher validation", () => {
  it("skips invalid persisted watchers", async () => {
    const p = path.join(os.tmpdir(), `sentinel-state-${Date.now()}.json`);
    await fs.writeFile(
      p,
      JSON.stringify({
        watchers: [
          {
            id: "bad",
            skillId: "skills.bad",
            enabled: true,
            strategy: "http-poll",
            endpoint: "https://evil.example.net",
            match: "all",
            conditions: [{ path: "x", op: "exists" }],
            fire: { webhookPath: "/hooks/agent", eventName: "x", payloadTemplate: { a: "1" } },
            retry: { maxRetries: 0, baseMs: 100, maxMs: 100 },
          },
        ],
        runtime: {},
        updatedAt: new Date().toISOString(),
      }),
    );

    const manager = new WatcherManager(
      {
        allowedHosts: ["api.github.com"],
        localDispatchBase: "http://127.0.0.1:18789",
        stateFilePath: p,
        limits: {
          maxWatchersTotal: 10,
          maxWatchersPerSkill: 5,
          maxConditionsPerWatcher: 10,
          maxIntervalMsFloor: 1,
        },
      },
      {
        async dispatch() {
          /* noop */
        },
      },
    );

    await manager.init();
    expect(manager.list().length).toBe(0);
    expect(manager.status("bad")?.lastError).toContain("Invalid persisted watcher");
  });
});
