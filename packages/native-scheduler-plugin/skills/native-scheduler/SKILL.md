---
name: native-scheduler
description: "Manage persistent OS-level scheduled jobs (launchd/systemd/cron) via the native_scheduler tool."
metadata:
  openclaw.requires.config:
    - "plugins.native-scheduler.enabled"
---

# Native Scheduler

Manage persistent, OS-level scheduled jobs that survive reboots and gateway restarts. Uses the `native_scheduler` tool registered by the native-scheduler plugin.

## When to Use (vs the built-in `cron` tool)

| | `native_scheduler` | Built-in `cron` |
|---|---|---|
| **Persistence** | Survives reboots and gateway restarts — jobs live in the OS scheduler | Tied to the gateway process lifecycle |
| **Failure handling** | `defaultFailureResult` auto-fires prompts/messages on crash/timeout | Manual error handling |
| **Health tracking** | Per-job health, last-run status, failure history via wrapper | None built-in |
| **Use when** | You need a durable job that must keep running regardless of gateway state | You need a lightweight, in-process timer |

**Rule of thumb:** If the job matters enough that missing a run is a problem, use `native_scheduler`.

## Quick Start

```
native_scheduler action=status          # Check backend and config
native_scheduler action=list            # See all managed jobs
native_scheduler action=upsert job={...} # Create or update a job
```

## Key Concepts

### Absolute Paths Are Required

`command[0]` **must** be an absolute path. The OS scheduler (especially launchd) runs jobs with a minimal PATH (`/usr/bin:/bin:/usr/sbin:/sbin`). Bare executable names like `node` or `python3` will fail silently.

```jsonc
// ❌ Wrong — will fail at runtime
"command": ["node", "script.js"]

// ✅ Correct
"command": ["/opt/homebrew/bin/node", "/path/to/script.js"]
```

Find the right path with `which node`, `which python3`, etc.

### Schedule Types

**`startIntervalSeconds`** — Simple recurring interval. The job runs every N seconds.

```jsonc
"startIntervalSeconds": 300  // every 5 minutes
```

**`calendar`** — Cron-like calendar entries. Each entry can specify `minute`, `hour`, `day`, `weekday` (0=Sunday), `month`. Omitted fields match all values (wildcard).

```jsonc
// Daily at 09:00
"calendar": [{ "hour": 9, "minute": 0 }]

// Every Monday and Friday at 14:30
"calendar": [
  { "weekday": 1, "hour": 14, "minute": 30 },
  { "weekday": 5, "hour": 14, "minute": 30 }
]
```

You can combine multiple calendar entries in the array. Do **not** use both `startIntervalSeconds` and `calendar` on the same job — pick one.

### The `defaultFailureResult` Pattern

When a job script crashes, times out, or produces no valid output, the wrapper fires `defaultFailureResult`. This is your safety net — make it actionable.

**`prompt`** — Sends a prompt to the agent session. Best for jobs where the agent should diagnose and fix the issue:

```jsonc
"defaultFailureResult": {
  "result": "prompt",
  "text": "The daily-sync job failed. Check `native_scheduler action=failures id=daily-sync` for details and fix the root cause."
}
```

**`message`** — Sends a message to a channel. Best for alerting a human:

```jsonc
"defaultFailureResult": {
  "result": "message",
  "text": "⚠️ daily-sync job failed — check logs",
  "channel": "discord",
  "target": "channel:1234567890"
}
```

**`noop`** — Do nothing on failure (the default if omitted). Only use for fire-and-forget jobs where failure is acceptable.

**Tip:** Write `text` as a mini-runbook — include the diagnostic command to run and what to look for, not just "it failed."

### Platform Backends

The plugin auto-detects the best backend for the current OS (`"backend": "auto"`):

| Platform | Backend | Notes |
|---|---|---|
| macOS | `launchd` | User-level LaunchAgents; supports `calendar` and `runAtLoad` |
| Linux | `systemd` | User-level systemd timers; falls back to `cron` if systemd is unavailable |
| Linux (no systemd) | `cron` | Classic crontab; `calendar` is converted to cron expressions |
| Windows | `windows-task-scheduler` | Windows Task Scheduler via `schtasks` |

You can override with `backend: "launchd"` (etc.) but `"auto"` is almost always correct.

### Namespace and Data Directory

**`namespace`** — Prefix for job names in the OS scheduler (e.g., `com.openclaw.mynamespace.jobid`). Configured in the plugin settings; defaults to a sensible value. Use a custom namespace to isolate groups of jobs.

**`dataDir`** — Directory where the wrapper stores per-job state (health, run history, failure logs). Defaults to a platform-appropriate location. Only override if you need a custom storage path.

Both are set in plugin config and rarely need per-call overrides.

## Common Actions

### Inspect existing jobs

```
native_scheduler action=list
native_scheduler action=get id=my-job
```

### Check job health and failures

```
native_scheduler action=health                  # All jobs
native_scheduler action=health id=my-job        # Specific job
native_scheduler action=last-run id=my-job      # Latest run details
native_scheduler action=failures id=my-job      # Recent failure history
native_scheduler action=logs id=my-job          # Tail stdout/stderr
```

### Create or update a job

```
native_scheduler action=upsert job={
  "id": "my-job",
  "description": "Does the thing every 10 minutes",
  "command": ["/opt/homebrew/bin/node", "/path/to/script.js"],
  "startIntervalSeconds": 600,
  "defaultFailureResult": {
    "result": "prompt",
    "text": "my-job failed. Run: native_scheduler action=failures id=my-job"
  }
}
```

### Enable, disable, run, remove

```
native_scheduler action=disable id=my-job   # Pause without removing
native_scheduler action=enable id=my-job    # Resume
native_scheduler action=run id=my-job       # Trigger immediately
native_scheduler action=remove id=my-job    # Delete job and wrapper artifacts
```

## Gotchas

1. **Always use absolute paths in `command[]`.** This is the #1 cause of jobs that "work manually but fail in the scheduler."
2. **Don't mix `startIntervalSeconds` and `calendar`** on the same job.
3. **`runAtLoad`** (launchd only) runs the job once immediately when loaded — useful for ensuring a job fires on boot, but can cause unexpected runs during upsert.
4. **Check `action=health` after creating a job** to confirm it's actually running. A successful upsert only means the job was registered, not that it executed.
5. **`action=list` is your friend.** Before creating jobs, check what already exists to avoid duplicates.
6. **Use `OPENCLAW_RESULT_FILE` for result delivery**, not stdout. Any debug output (`echo`, `console.log`, `print()`) mixed into stdout can silently break result JSON parsing. See [Script Result Delivery](#script-result-delivery) below.

## Script Result Delivery

The wrapper injects the `OPENCLAW_RESULT_FILE` environment variable into every script subprocess. It points to a temp file path where your script should write its result JSON.

### Why not stdout?

Stdout is a leaky channel. Any stray `echo`, `console.log()`, or `print()` — even from a dependency — silently corrupts the result JSON that the wrapper tries to parse. Debugging a script that "works but the result is broken" almost always traces back to unexpected stdout output. `OPENCLAW_RESULT_FILE` gives scripts a clean, dedicated delivery channel so stdout can be used freely for logging and debugging.

### The pattern

Check for the env var → write your result JSON to that path → use stdout/stderr freely for debugging.

**Bash:**

```bash
#!/usr/bin/env bash
echo "Starting job..."  # safe — stdout is just for debugging now

# ... do work ...

if [ -n "$OPENCLAW_RESULT_FILE" ]; then
  echo '{"result":"prompt","text":"Daily sync complete — 42 items processed."}' > "$OPENCLAW_RESULT_FILE"
fi
```

**Node.js:**

```js
import { writeFileSync } from 'node:fs';

console.log('Starting job...');  // safe — won't interfere with result

// ... do work ...

const resultFile = process.env.OPENCLAW_RESULT_FILE;
if (resultFile) {
  writeFileSync(resultFile, JSON.stringify({
    result: 'prompt',
    text: 'Daily sync complete — 42 items processed.'
  }));
}
```

**Python 3:**

```python
import os, json

print('Starting job...')  # safe — won't interfere with result

# ... do work ...

result_file = os.environ.get('OPENCLAW_RESULT_FILE')
if result_file:
    with open(result_file, 'w') as f:
        json.dump({"result": "prompt", "text": "Daily sync complete — 42 items processed."}, f)
```

### Backward compatibility

If your script doesn't write to `OPENCLAW_RESULT_FILE`, the wrapper falls back to parsing stdout for result JSON — the old behavior still works. But prefer the file in all new scripts. The fallback exists for legacy compatibility, not as a recommended path.
