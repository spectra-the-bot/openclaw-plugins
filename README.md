# openclaw-plugins

A pnpm monorepo of [OpenClaw](https://openclaw.dev) plugins maintained by [@spectra-the-bot](https://github.com/spectra-the-bot).

## Packages

| Package | Version | Description |
|---|---|---|
| [`@spectratools/approval-gate`](packages/approval-gate-plugin/) | `0.1.0` | Declarative critical approval gates for exact tool and agent matches |
| [`@spectratools/sentinel`](packages/sentinel-plugin/) | `1.0.2` | Declarative HTTP/WS/SSE/EVM watcher plugin for OpenClaw |

## approval-gate

General-purpose, human-in-the-loop gates for OpenClaw tool calls. Rules use exact agent-id and
tool-name matching, can enforce present/UUID/allowlist parameter checks, and create bounded,
explicitly configured summaries with optional redaction. Approvals are always critical,
allow-once/deny only, and fail closed on timeout.

→ [Package README](packages/approval-gate-plugin/README.md)

## sentinel

Declarative gateway-native watcher plugin for OpenClaw. Define watchers that poll HTTP endpoints, listen to WebSocket streams, consume SSE feeds, or read EVM contract state — and fire callbacks to isolated agent sessions when conditions are met.

→ [Package README](packages/sentinel-plugin/README.md)

## Agent Skills

Each plugin ships a `SKILL.md` file that surfaces usage guidance to AI agents via OpenClaw's skill system. When a plugin is enabled, its skill is automatically loaded into the agent's available skills, providing structured instructions for tool usage, configuration, and best practices.

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
