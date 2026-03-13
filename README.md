# @spectratools/native-scheduler-plugin

Cross-platform native scheduler plugin for OpenClaw.

## Goals

Provide a single plugin/tool abstraction over:

- macOS `launchd`
- Linux `systemd timers` and/or `cron`
- Windows Task Scheduler

The intent is to offload deterministic, zero-token background work from OpenClaw cron when no LLM turn is needed.

## Packages

This is a pnpm workspace monorepo:

- **`@spectratools/native-scheduler-plugin`** (root) — the OpenClaw plugin
- **`@spectratools/native-scheduler-types`** (`packages/native-scheduler-types/`) — input/output contract types for user scripts

## Current status

Phase 2 implementation includes:

- macOS launchd adapter with native `launchctl` integration
- wrapper-runner model (jobs execute through a generated Node wrapper)
- **Structured script I/O:** wrapper pipes `NativeSchedulerRunContext` as JSON to script stdin, parses `NativeSchedulerResult` from stdout
- Fallback to exit-code-based detection when stdout is not valid result JSON
- Status file schema and storage layout per job (`latest.json`, `health.json`, `runs/*.json`)
- Optional failure callbacks (`command` or `openclaw-event` target)
- Health/run inspection actions on the tool (`health`, `last-run`, `failures`)
- `oxfmt` formatting + CI scaffold
- Vitest suite covering types, wrapper lifecycle, stdin/stdout contract, and tool behavior

## Script contract

Scripts receive a `NativeSchedulerRunContext` JSON object on stdin:

```ts
interface NativeSchedulerRunContext {
  schemaVersion: 1;
  runId: string;
  jobId: string;
  namespace: string;
  triggeredAt: number; // UTC epoch milliseconds
  platform: string;
  backend: string;
  config: Record<string, unknown>;
}
```

Scripts may emit a `NativeSchedulerResult` JSON object on stdout:

```ts
type NativeSchedulerResult =
  | { result: "noop" }
  | { result: "prompt"; text: string }
  | { result: "failure"; error: string; code?: number };
```

If stdout is not valid result JSON, the wrapper falls back to exit-code-based detection (0 = noop, nonzero = failure).

## Local development

```bash
pnpm install
pnpm check        # format:check + typecheck + test (root plugin)
pnpm -r check     # run checks across all packages
```

## Install in OpenClaw

Once published:

```bash
openclaw plugins install @spectratools/native-scheduler-plugin
```

Then enable/configure it in OpenClaw config.

## Tool surface (current)

- `status`
- `list`
- `get`
- `upsert`
- `remove`
- `run`
- `enable`
- `disable`
- `health`
- `last-run`
- `failures`

## Notes

- On macOS, `launchd` should be the primary backend, not classic cron.
- On Linux, `systemd timers` are preferable when available; cron can be fallback.
- On Windows, use Task Scheduler.
- The current implementation is intentionally minimal and non-destructive.
