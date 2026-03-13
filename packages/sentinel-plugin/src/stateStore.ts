import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { SentinelStateFile, WatcherDefinition, WatcherRuntimeState } from "./types.js";
import { resolveOpenClawStateDir } from "./utils.js";

export function defaultStatePath(dataDir?: string): string {
  const dir = dataDir ?? path.join(resolveOpenClawStateDir(), "data", "sentinel");
  return path.join(dir, "state.json");
}

export async function loadState(filePath: string): Promise<SentinelStateFile> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { watchers: [], runtime: {}, updatedAt: new Date().toISOString() };
    }
    throw err;
  }
  const parsed = JSON.parse(raw) as SentinelStateFile;
  return {
    watchers: parsed.watchers ?? [],
    runtime: parsed.runtime ?? {},
    updatedAt: parsed.updatedAt ?? new Date().toISOString(),
  };
}

export async function saveState(
  filePath: string,
  watchers: WatcherDefinition[],
  runtime: Record<string, WatcherRuntimeState>,
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const tmpPath = `${filePath}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  await fs.writeFile(
    tmpPath,
    JSON.stringify({ watchers, runtime, updatedAt: new Date().toISOString() }, null, 2),
    { mode: 0o600 },
  );
  await fs.rename(tmpPath, filePath);
}

export function mergeState(
  existing: SentinelStateFile,
  incoming: SentinelStateFile,
): SentinelStateFile {
  const watcherMap = new Map(existing.watchers.map((w) => [w.id, w]));
  for (const watcher of incoming.watchers) watcherMap.set(watcher.id, watcher);
  return {
    watchers: [...watcherMap.values()],
    runtime: { ...existing.runtime, ...incoming.runtime },
    updatedAt: new Date().toISOString(),
  };
}
