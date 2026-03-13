#!/usr/bin/env -S npx tsx
/**
 * Heartbeat example — simplest possible script. Always returns noop.
 *
 * Usage: pipe NativeSchedulerRunContext as JSON on stdin.
 * Output: NativeSchedulerResult as JSON on stdout.
 */
import type {
  NativeSchedulerResult,
  NativeSchedulerRunContext,
} from "@spectratools/native-scheduler-types";

async function main() {
  // Drain stdin (required by contract)
  let stdinData = "";
  for await (const chunk of process.stdin) {
    stdinData += chunk;
  }
  const _ctx: NativeSchedulerRunContext = JSON.parse(stdinData);

  const result: NativeSchedulerResult = { result: "noop" };
  process.stdout.write(JSON.stringify(result));
}

main().catch((err) => {
  process.stderr.write(String(err) + "\n");
  process.exit(1);
});
