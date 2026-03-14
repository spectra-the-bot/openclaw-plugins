# @spectratools/sentinel

Declarative gateway-native watcher plugin for [OpenClaw](https://openclaw.dev). Define watchers that poll HTTP endpoints, WebSocket streams, SSE feeds, or EVM contract state — and fire callbacks to agent sessions when conditions are met.

## Installation

```bash
openclaw plugins install @spectratools/sentinel
```

## Configuration

Config options in `openclaw.json` under `plugins.sentinel`:

| Option | Type | Default | Description |
|---|---|---|---|
| `allowedHosts` | `string[]` | `[]` | Hostnames watchers may connect to (**required** — no hosts allowed by default) |
| `hookSessionPrefix` | `string` | `agent:main:hooks:sentinel` | Base session key for isolated callback sessions |
| `defaultHookModel` | `string` | — | LLM model for callback sessions (per-watcher `fire.model` takes precedence) |
| `notificationPayloadMode` | `"none" \| "concise" \| "debug"` | `"concise"` | How much data to include in notification payloads |
| `dataDir` | `string` | — | Managed data directory for state and operator goal files |
| `maxOperatorGoalChars` | `number` | `12000` | Maximum `operatorGoal` length |

## Watcher Definition

```ts
{
  id: "my-watcher",
  skillId: "my-skill",
  enabled: true,
  strategy: "http-poll",    // http-poll | websocket | sse | evm-call
  endpoint: "https://api.example.com/status",
  intervalMs: 30000,
  match: "all",             // all | any
  conditions: [
    { path: "$.status", op: "eq", value: "degraded" }
  ],
  fire: {
    webhookPath: "/hooks/sentinel",
    eventName: "status-degraded",
    payloadTemplate: { status: "${$.status}" },
    operatorGoal: "The API is degraded. Notify the on-call channel and check recent deployments.",
  },
  retry: { maxRetries: 3, baseMs: 1000, maxMs: 30000 },
}
```

## Strategies

| Strategy | Description |
|---|---|
| `http-poll` | Periodic GET/POST requests |
| `websocket` | Persistent WebSocket connection |
| `sse` | Server-Sent Events stream |
| `evm-call` | Ethereum contract read via `eth_call` |

## Condition Operators

`eq` · `neq` · `gt` · `gte` · `lt` · `lte` · `exists` · `absent` · `contains` · `matches` · `changed`

Conditions are evaluated against each response using JSONPath expressions. Use `match: "all"` to require every condition to pass, or `match: "any"` to fire when at least one matches.

## Callback (Hook Session)

When conditions fire, sentinel spawns an isolated agent session with the callback envelope and `operatorGoal` as context. The callback agent uses these tools:

- **`sentinel_act(notify)`** — deliver a notification (fulfills the relay contract, cancels the timeout fallback)
- **`sentinel_act(run_command)`** — execute a shell command
- **`sentinel_escalate`** — signal the agent can't handle it (lets the timeout fallback relay fire)

> ⚠️ In callback sessions, use `sentinel_act(notify)` for delivery — **not** the `message` tool. Using `message` directly bypasses the relay contract and causes double-delivery.

## operatorGoal vs payloadTemplate

| Field | Purpose |
|---|---|
| `operatorGoal` | Natural language instruction for the callback agent — describes what success looks like |
| `payloadTemplate` | Structured key-value data included in the callback envelope — for data, not instructions |
| `operatorGoalFile` | Path to a file read fresh at fire time — for dynamic policy/config that changes between fires |

## Security

- **`allowedHosts` must be configured** — connections to unlisted hosts are blocked
- HTTP strategies reject redirects by default
- Private/reserved IP ranges are blocked unless explicitly allowlisted

## Agent Skill

Ships a `SKILL.md` covering tool usage, relay contract semantics, and watcher lifecycle. The skill is loaded automatically when the plugin is enabled, providing agents with structured instructions for creating and managing watchers.

## License

MIT
