# Script Contract

Scripts executed by native-scheduler follow a strict input/output contract defined in `@spectratools/native-scheduler-types`.

## Input: `NativeSchedulerRunContext`

The wrapper pipes this as JSON to your script's **stdin**. Your script must drain stdin even if it doesn't use the context.

```ts
interface NativeSchedulerRunContext {
  schemaVersion: 1;
  runId: string;              // Unique ID for this execution
  jobId: string;              // The job's identifier
  namespace: string;          // Plugin namespace
  triggeredAt: number;        // UTC epoch milliseconds
  platform: string;           // e.g. "darwin", "linux", "win32"
  backend: string;            // e.g. "launchd", "systemd", "cron"
  config: Record<string, unknown>; // Plugin config passthrough
}
```

## Result delivery: `OPENCLAW_RESULT_FILE`

The runner injects an `OPENCLAW_RESULT_FILE` environment variable pointing to a run-specific temporary file. Scripts can write their result JSON to this file instead of stdout. This is the **recommended** approach because it allows scripts to freely use `console.log`, `echo`, `print()`, etc. for debug output without breaking result parsing.

**Priority order:**
1. If `OPENCLAW_RESULT_FILE` exists and contains valid result JSON → use it
2. Otherwise, fall back to parsing stdout (backward compatible)

The runner cleans up the result file automatically after reading.

### Bash example

```bash
#!/usr/bin/env bash
cat > /dev/null  # drain stdin

echo "DEBUG: checking disk usage..."
USAGE=$(df -h / | tail -1 | awk '{print $5}')
echo "DEBUG: usage is $USAGE"

# Write result to the file — stdout noise doesn't matter
echo '{"result":"prompt","text":"Disk usage: '"$USAGE"'"}' > "$OPENCLAW_RESULT_FILE"
```

### Python example

```python
#!/usr/bin/env python3
import json, os, sys

sys.stdin.read()  # drain stdin

print("DEBUG: running health check...")  # safe — won't break results

result = {"result": "noop"}
result_file = os.environ.get("OPENCLAW_RESULT_FILE")
if result_file:
    with open(result_file, "w") as f:
        json.dump(result, f)
```

### Node.js example

```js
#!/usr/bin/env node
import fs from "node:fs";

process.stdin.resume();
process.stdin.on("end", () => {
  console.log("DEBUG: starting up...");  // safe — won't break results

  const result = { result: "noop" };
  const resultFile = process.env.OPENCLAW_RESULT_FILE;
  if (resultFile) {
    fs.writeFileSync(resultFile, JSON.stringify(result));
  }
});
```

::: tip Backward compatibility
Scripts that write results to stdout still work. If `OPENCLAW_RESULT_FILE` is not written to, the runner falls back to parsing stdout as before.
:::

## Output: `NativeSchedulerResult`

Your script writes one of three result types as JSON to `OPENCLAW_RESULT_FILE` (preferred) or **stdout** (legacy).

### `noop` — Nothing to do

```ts
type NativeSchedulerNoopResult = { result: "noop" };
```

The wrapper records a successful run and takes no further action. Use this when your script ran but determined nothing needs reporting.

### `prompt` — Trigger an agent turn

```ts
type NativeSchedulerPromptResult = {
  result: "prompt";
  text: string;           // Message sent to the agent
  session?: string;       // Optional session key override
};
```

The wrapper dispatches `text` to an agent session, consuming LLM tokens. Use this when you need the agent to reason about the result (e.g., disk usage above threshold).

### `message` — Zero-token channel delivery

```ts
type NativeSchedulerMessageResult = {
  result: "message";
  text: string;
  channel: "discord" | "telegram" | "slack" | "signal"
         | "imessage" | "whatsapp" | "line";
  target?: string;         // Channel/chat ID within the provider
};
```

The wrapper delivers `text` directly to the specified channel without invoking an LLM turn. Zero tokens consumed.

::: warning Channel restriction
Only built-in OpenClaw channel providers are supported. Plugin-added channels (e.g., xmtp, matrix) must use `{ result: "prompt" }` instead and let the agent dispatch to the channel. This restriction will be lifted once OpenClaw exposes `dispatchChannelMessageAction` on the plugin runtime API.
:::

## `defaultFailureResult`

Jobs can specify a `defaultFailureResult` in their definition. This result is fired when the script crashes, times out, or produces no valid output. Defaults to `{ result: "noop" }` if not specified.

```json
{
  "defaultFailureResult": {
    "result": "prompt",
    "text": "⚠️ Health check script crashed or timed out"
  }
}
```

## Validation helpers

The types package exports runtime validation functions:

| Function | Description |
|---|---|
| `isRunContext(value)` | Type guard for `NativeSchedulerRunContext` |
| `isResult(value)` | Type guard for `NativeSchedulerResult` |
| `parseResult(raw)` | Parse JSON string → `NativeSchedulerResult \| undefined` |
| `assertRunContext(value)` | Validate or throw |
| `assertResult(value)` | Validate or throw |
| `buildRunContext(params)` | Construct and validate a `NativeSchedulerRunContext` |

## Script template

```ts
#!/usr/bin/env -S npx tsx
import fs from "node:fs";
import type {
  NativeSchedulerResult,
  NativeSchedulerRunContext,
} from "@spectratools/native-scheduler-types";

async function main() {
  let stdinData = "";
  for await (const chunk of process.stdin) {
    stdinData += chunk;
  }
  const ctx: NativeSchedulerRunContext = JSON.parse(stdinData);

  console.log("Processing job:", ctx.jobId);  // safe with OPENCLAW_RESULT_FILE

  // Your logic here...

  const result: NativeSchedulerResult = { result: "noop" };

  // Write result to OPENCLAW_RESULT_FILE (preferred)
  const resultFile = process.env.OPENCLAW_RESULT_FILE;
  if (resultFile) {
    fs.writeFileSync(resultFile, JSON.stringify(result));
  } else {
    // Fallback for older runners
    process.stdout.write(JSON.stringify(result));
  }
}

main().catch((err) => {
  process.stderr.write(String(err) + "\n");
  process.exit(1);
});
```
