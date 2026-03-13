# Examples

The [`examples/`](https://github.com/spectra-the-bot/openclaw-plugins/tree/main/examples) directory contains ready-to-use scripts demonstrating the script contract.

## heartbeat.ts

The simplest possible script — always returns `noop`.

```ts
import type {
  NativeSchedulerResult,
  NativeSchedulerRunContext,
} from "@spectratools/native-scheduler-types";

async function main() {
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
```

**Use case:** Lightweight keep-alive or "script ran successfully" signal. The wrapper records a healthy run without consuming any tokens.

## notify.ts

Delivers a message directly to a Discord channel — zero tokens.

```ts
const result: NativeSchedulerResult = {
  result: "message",
  text: `🔔 Notification from job ${ctx.jobId} at ${new Date(ctx.triggeredAt).toISOString()}`,
  channel: "discord",
  target: "1234567890123456789", // Discord channel ID
};
```

**Use case:** Periodic notifications, status pings, or alerts that don't need LLM reasoning.

## health-check.ts

Checks disk usage and only triggers an agent prompt when above a threshold.

```ts
const usage = getDiskUsagePercent();

if (usage >= THRESHOLD_PERCENT) {
  result = {
    result: "prompt",
    text: `⚠️ Disk usage is at ${usage}% (threshold: ${THRESHOLD_PERCENT}%). Consider freeing space.`,
  };
} else {
  result = { result: "noop" };
}
```

**Use case:** Conditional alerting — returns `noop` (zero tokens) most of the time and only invokes the agent when action is needed.

## Registering an example as a job

```json
{
  "action": "upsert",
  "job": {
    "id": "disk-check",
    "command": ["npx", "tsx", "./examples/health-check.ts"],
    "startIntervalSeconds": 3600,
    "defaultFailureResult": {
      "result": "prompt",
      "text": "⚠️ Disk check script crashed"
    }
  }
}
```
