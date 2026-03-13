import os from "node:os";
import nodePath from "node:path";

export function resolveOpenClawStateDir(): string {
  const override = process.env.OPENCLAW_STATE_DIR?.trim() || process.env.CLAWDBOT_STATE_DIR?.trim();
  return override ?? nodePath.join(os.homedir(), ".openclaw");
}

export function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path.split(".").reduce((acc: unknown, part) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[part];
  }, obj);
}
