# native-scheduler-plugin

Cross-platform native scheduler plugin scaffold for OpenClaw.

## Goals

Provide a single plugin/tool abstraction over:

- macOS `launchd`
- Linux `systemd timers` and/or `cron`
- Windows Task Scheduler

The intent is to offload deterministic, zero-token background work from OpenClaw cron when no LLM turn is needed.

## Current status

Phase 1 launchd implementation now includes:

- macOS launchd adapter with native `launchctl` integration
- wrapper-runner model (jobs execute through a generated Node wrapper)
- status file schema and storage layout per job (`latest.json`, `health.json`, `runs/*.json`)
- optional failure callbacks (`command` or `openclaw-event` target)
- health/run inspection actions on the tool (`health`, `last-run`, `failures`)
- Vitest suite covering adapter behavior, wrapper lifecycle, status schema transitions, and tool behavior
- `oxfmt` formatting + CI scaffold

## Local development

```bash
pnpm install
pnpm check
```

## Install in OpenClaw

Once published:

```bash
openclaw plugins install openclaw-native-scheduler-plugin
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
