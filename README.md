# openclaw-plugins

A pnpm monorepo of [OpenClaw](https://openclaw.dev) plugins maintained by [@spectra-the-bot](https://github.com/spectra-the-bot).

## Packages

| Package | Version | Description |
|---|---|---|
| [`@spectratools/native-scheduler`](packages/native-scheduler-plugin/) | `0.1.1` | macOS launchd scheduler plugin for OpenClaw |
| [`@spectratools/native-scheduler-types`](packages/native-scheduler-types/) | `0.1.0` | Script I/O contract types for native-scheduler |
| [`@spectratools/sentinel`](packages/sentinel-plugin/) | `0.9.1` | Declarative HTTP/WS/SSE/EVM watcher plugin for OpenClaw |

## native-scheduler

Cross-platform native OS scheduler plugin that offloads deterministic background work from OpenClaw's built-in cron by scheduling scripts via the platform-native scheduler. Scripts run independently of the gateway process — if the gateway restarts, scheduled jobs keep firing.

Currently fully supported on macOS via launchd, with Linux (systemd/cron) and Windows (Task Scheduler) planned.

→ [Package README](packages/native-scheduler-plugin/README.md)

## native-scheduler-types

TypeScript type definitions for the native-scheduler script I/O contract. Defines `NativeSchedulerRunContext` (stdin input) and `NativeSchedulerResult` (stdout output) so scripts can be authored with full type safety.

→ [Package README](packages/native-scheduler-types/)

## sentinel

Declarative gateway-native watcher plugin for OpenClaw. Define watchers that poll HTTP endpoints, listen to WebSocket streams, consume SSE feeds, or read EVM contract state — and fire callbacks to isolated agent sessions when conditions are met.

→ [Package README](packages/sentinel-plugin/README.md)

## Agent Skills

Both plugins ship `SKILL.md` files that surface usage guidance to AI agents via OpenClaw's skill system. When a plugin is enabled, its skill is automatically loaded into the agent's available skills, providing structured instructions for tool usage, configuration, and best practices.

## Development

```bash
pnpm install        # install dependencies
pnpm build          # build all packages
pnpm test           # vitest across all packages
pnpm typecheck      # tsc --noEmit across all packages
pnpm lint           # biome lint
```

## CI

Tests run on Ubuntu, macOS, and Windows via GitHub Actions. Releases are changeset-driven and published to npm automatically.

## Documentation

Full documentation is available at [plugins.spectratools.dev](https://plugins.spectratools.dev).

## License

MIT
