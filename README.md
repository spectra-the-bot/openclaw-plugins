# native-scheduler-plugin

Cross-platform native scheduler plugin scaffold for OpenClaw.

## Goals

Provide a single plugin/tool abstraction over:

- macOS `launchd`
- Linux `systemd timers` and/or `cron`
- Windows Task Scheduler

The intent is to offload deterministic, zero-token background work from OpenClaw cron when no LLM turn is needed.

## Current status

This repo is an initial scaffold with:

- pnpm project setup
- OpenClaw plugin manifest
- TypeScript entrypoint
- placeholder optional tool: `native_scheduler`
- `oxfmt` formatting
- GitHub Actions CI
- GitHub Actions npm publish workflow scaffold

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

## Planned tool surface

- `status`
- `list`
- `create`
- `update`
- `remove`
- `run`
- `enable`
- `disable`
- `logs`

## Notes

- On macOS, `launchd` should be the primary backend, not classic cron.
- On Linux, `systemd timers` are preferable when available; cron can be fallback.
- On Windows, use Task Scheduler.
- The current implementation is intentionally minimal and non-destructive.
