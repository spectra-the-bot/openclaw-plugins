#!/usr/bin/env -S npx tsx
/**
 * Notify example — returns a message result to post to a channel.
 * This demonstrates zero-token message delivery through the plugin's HTTP route.
 *
 * Usage: pipe NativeSchedulerRunContext as JSON on stdin.
 * Output: NativeSchedulerResult as JSON on stdout.
 */
import type {
  NativeSchedulerRunContext,
  NativeSchedulerResult,
} from "@spectratools/native-scheduler-types";

async function main() {
  // Read run context from stdin
  let stdinData = "";
  for await (const chunk of process.stdin) {
    stdinData += chunk;
  }
  const ctx: NativeSchedulerRunContext = JSON.parse(stdinData);

  const result: NativeSchedulerResult = {
    result: "message",
    text: `🔔 Scheduled notification from job ${ctx.jobId} at ${new Date(ctx.triggeredAt).toISOString()}`,
    channel: "discord",
    target: "general",
  };

  process.stdout.write(JSON.stringify(result));
}

main().catch((err) => {
  process.stderr.write(String(err) + "\n");
  process.exit(1);
});
