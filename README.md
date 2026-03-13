# openclaw-plugins

A pnpm monorepo of OpenClaw plugins maintained by [@spectra-the-bot](https://github.com/spectra-the-bot).

## Packages

| Package | Version | Description |
|---|---|---|
| [`@spectratools/native-scheduler-plugin`](packages/native-scheduler-plugin/) | 0.1.0 | Cross-platform native OS scheduler plugin for OpenClaw |
| [`@spectratools/native-scheduler-types`](packages/native-scheduler-types/) | 0.1.0 | Script I/O contract types for native-scheduler |
| [`@spectratools/sentinel-plugin`](packages/sentinel-plugin/) | 0.9.0 | Secure declarative gateway-native watcher plugin for OpenClaw |

## native-scheduler-plugin

Offloads deterministic, zero-token background work from OpenClaw's built-in cron system by scheduling scripts via the platform-native scheduler.

**Platform support:**
- ✅ macOS — `launchd`
- 🚧 Linux — `systemd timers` / `cron` (planned)
- 🚧 Windows — Task Scheduler (planned)

**Script contract** — scripts receive a `NativeSchedulerRunContext` JSON on stdin and write a `NativeSchedulerResult` JSON to stdout:

```ts
// Input (stdin)
interface NativeSchedulerRunContext {
  schemaVersion: 1;
  runId: string;
  jobId: string;
  namespace: string;
  triggeredAt: number; // UTC epoch ms
  platform: string;
  backend: string;
  config: Record<string, unknown>;
}

// Output (stdout)
type NativeSchedulerResult =
  | { result: "noop" }
  | { result: "prompt"; text: string; session?: string }
  | { result: "message"; text: string; channel: "discord" | "telegram" | "slack" | "signal" | "imessage" | "whatsapp" | "line"; target?: string };
```

`prompt` results are delivered to an agent session via `openclaw system event` (costs tokens). `message` results are sent directly to the specified channel with zero tokens.

**Tool actions:** `status` · `list` · `get` · `upsert` · `remove` · `run` · `enable` · `disable` · `health` · `last-run` · `failures` · `logs`

## sentinel-plugin

Declarative HTTP/WebSocket/SSE/EVM watcher plugin. Polls endpoints on a configurable interval, evaluates JSONPath conditions, and fires webhook callbacks to agent sessions when conditions are met.

See the upstream repo for full documentation: [coffeexcoin/openclaw-sentinel](https://github.com/coffeexcoin/openclaw-sentinel)

## Development

```bash
pnpm install
pnpm check          # biome check + typecheck + test (all packages)
pnpm lint           # biome lint
pnpm typecheck      # tsc --noEmit across all packages
pnpm test           # vitest across all packages
```

## CI

Tests run on ubuntu, macos, and windows via GitHub Actions.
