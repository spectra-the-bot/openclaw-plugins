# @spectratools/native-scheduler

Cross-platform native OS scheduler plugin for [OpenClaw](https://openclaw.dev). Offloads deterministic background work from OpenClaw's built-in cron by scheduling scripts via the platform-native scheduler. Scripts run independently of the gateway process — if the gateway restarts or goes down, scheduled jobs keep firing.

## Platform Support

- ✅ **macOS** — launchd (fully supported)
- 🚧 **Linux** — systemd / cron (planned)
- 🚧 **Windows** — Task Scheduler (planned)

## Installation

```bash
# Install via OpenClaw plugin system
openclaw plugins install @spectratools/native-scheduler
```

## Configuration

Config options in `openclaw.json` under `plugins.native-scheduler`:

| Option | Type | Default | Description |
|---|---|---|---|
| `defaultBackend` | `"auto" \| "launchd" \| "systemd" \| "cron" \| "windows-task-scheduler"` | `"auto"` | Scheduler backend to use |
| `namespace` | `string` | — | Prefix for managed job names |
| `dataDir` | `string` | — | Directory for wrapper runner state files (health, run history) |

## PATH Resolution (launchd)

launchd runs with a minimal PATH (`/usr/bin:/bin:/usr/sbin:/sbin`). The plugin auto-resolves the user's login shell PATH at upsert time and injects it into the plist so Homebrew binaries, nvm, pyenv, etc. work out of the box.

Set `environment.PATH` explicitly in the job definition to override.

## Tool Actions

| Action | Description |
|---|---|
| `status` | Plugin and backend status |
| `list` | List all managed jobs |
| `get` | Get details for a specific job |
| `upsert` | Create or update a job |
| `remove` | Remove a job |
| `run` | Trigger a job immediately |
| `enable` | Enable a disabled job |
| `disable` | Disable a job without removing it |
| `health` | Health check for a job |
| `last-run` | Get last run result and timing |
| `failures` | List recent failures for a job |
| `logs` | View job output logs |

## Script I/O Contract

Scripts receive a `NativeSchedulerRunContext` JSON on stdin and write a `NativeSchedulerResult` JSON to stdout. Types are available in the [`@spectratools/native-scheduler-types`](../native-scheduler-types/) package.

### Input (stdin)

```ts
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
```

### Output (stdout)

```ts
type NativeSchedulerResult =
  | { result: "noop" }
  | { result: "prompt"; text: string; session?: string }
  | {
      result: "message";
      text: string;
      channel: "discord" | "telegram" | "slack" | "signal" | "imessage" | "whatsapp" | "line";
      target?: string;
    };
```

| Result | Effect |
|---|---|
| `noop` | Do nothing |
| `prompt` | Inject text into an agent session (costs tokens) |
| `message` | Send directly to a channel (zero tokens) |

## Failure Handling

Set `defaultFailureResult` on a job to define what happens when a script crashes or times out:

```ts
{
  result: "prompt",
  text: "Job X failed — check logs and investigate."
}
```

Uses the same `noop | prompt | message` shape as normal results. This ensures failures are surfaced to the right place without manual monitoring.

## Agent Skill

Ships a `SKILL.md` that surfaces usage guidance to AI agents via OpenClaw's skill system. The skill is loaded automatically when the plugin is enabled, providing agents with structured instructions for managing scheduled jobs.

## License

MIT
