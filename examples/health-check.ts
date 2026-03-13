#!/usr/bin/env -S npx tsx
/**
 * Health check example — checks disk usage and returns prompt if above threshold.
 *
 * Usage: pipe NativeSchedulerRunContext as JSON on stdin.
 * Output: NativeSchedulerResult as JSON on stdout.
 */
import { execSync } from "node:child_process";
import type {
  NativeSchedulerRunContext,
  NativeSchedulerResult,
} from "@spectratools/native-scheduler-types";

const THRESHOLD_PERCENT = 90;

function getDiskUsagePercent(): number {
  try {
    const output = execSync("df -h / | tail -1", { encoding: "utf8" });
    const match = output.match(/(\d+)%/);
    return match ? parseInt(match[1]!, 10) : 0;
  } catch {
    return 0;
  }
}

async function main() {
  // Read run context from stdin (required by contract, but we don't need it here)
  let stdinData = "";
  for await (const chunk of process.stdin) {
    stdinData += chunk;
  }
  const _ctx: NativeSchedulerRunContext = JSON.parse(stdinData);

  const usage = getDiskUsagePercent();

  let result: NativeSchedulerResult;

  if (usage >= THRESHOLD_PERCENT) {
    result = {
      result: "prompt",
      text: `⚠️ Disk usage is at ${usage}% (threshold: ${THRESHOLD_PERCENT}%). Consider freeing space.`,
    };
  } else {
    result = { result: "noop" };
  }

  process.stdout.write(JSON.stringify(result));
}

main().catch((err) => {
  process.stderr.write(String(err) + "\n");
  process.exit(1);
});
