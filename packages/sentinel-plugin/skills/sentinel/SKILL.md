---
name: sentinel
description: Create and manage declarative watchers that monitor endpoints and trigger callback sessions.
metadata:
  openclaw.requires.config:
    - plugins.sentinel.enabled
---

# Sentinel — Declarative Watchers

Use sentinel when you need to **monitor an external endpoint** (HTTP, WebSocket, SSE, or an EVM contract) and **react automatically** when conditions are met.

## Tools

### `sentinel_control` — Manage watchers

Use from **any** session (not limited to callbacks).

| Action | Purpose |
|--------|---------|
| `create` | Define and register a new watcher |
| `list` | List all watchers (with status) |
| `status` / `get` | Get details of a single watcher by ID |
| `enable` | Activate a disabled watcher |
| `disable` | Pause a watcher without removing it |
| `remove` / `delete` | Permanently delete a watcher |

### `sentinel_act` — Execute actions inside a callback

**ONLY valid inside a sentinel callback session (hook session).** Two actions:

- **`run_command`** — Execute a shell command. Provide `command` (and optional `args`, `timeoutMs`).
- **`notify`** — Send a message to the watcher's delivery targets. Provide `message` (and optional `targets` override).

> **`sentinel_act` with `action: "notify"` is the ONLY correct way to deliver a notification from a callback.** It fulfills the relay contract and cancels the timeout fallback. Do **not** use the `message` tool for delivery inside a callback session — it bypasses the relay contract and the timeout fallback will still fire, producing duplicate or orphaned messages.

### `sentinel_escalate` — Escalate to a human

**ONLY valid inside a sentinel callback session.** Use when the situation requires human attention or is beyond automated resolution.

- Provide `reason` (string) and optional `severity` (`info` | `warning` | `critical`).
- **Deliberately does NOT fulfill the relay contract** — the timeout fallback relay will still fire, ensuring the human sees something even if the escalation alone is missed.

## Watcher Definition

### Strategies

| Strategy | Description |
|----------|-------------|
| `http-poll` | Periodic HTTP GET/POST requests |
| `websocket` | Persistent WebSocket connection |
| `sse` | Server-Sent Events stream |
| `evm-call` | Periodic EVM `eth_call` against a contract (use `evmCall` config for `to`, `signature`, `args`) |

### Conditions

Each condition evaluates against the response:

- **`path`** — JSONPath expression to extract a value from the response
- **`op`** — Comparison operator: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `exists`, `absent`, `contains`, `matches`, `changed`
- **`value`** — The value to compare against (not needed for `exists`, `absent`, `changed`)

Set `match: "all"` (every condition must pass) or `match: "any"` (at least one).

### Fire Config

When conditions match, the watcher fires:

- **`webhookPath`** — Path appended to the dispatch base URL for internal webhook delivery
- **`eventName`** — Event name included in the dispatched payload
- **`payloadTemplate`** — Key-value template for the webhook payload; supports `${...}` interpolation from matched response data
- **`operatorGoal`** — Natural-language description of what the callback agent should do when the watcher fires. This is injected into the callback session prompt. Be specific about the desired action, success criteria, and any constraints (max 12 000 chars by default, configurable up to 20 000).

### `fireOnce`

Set `fireOnce: true` to automatically disable the watcher after it fires once. Useful for one-shot alerts.

## Security — Allowed Hosts

All endpoint hostnames must be explicitly listed in `plugins.sentinel.allowedHosts` in your OpenClaw config. **No hosts are allowed by default.** A watcher targeting an unlisted host will be rejected at creation time.

## Watcher Lifecycle

```
create  →  (enabled by default)  →  disable / enable  →  remove
```

1. **Create** a watcher with `sentinel_control(action: "create", watcher: { ... })`. It starts enabled unless you set `enabled: false`.
2. **Disable** to pause polling without losing the definition.
3. **Enable** to resume.
4. **Remove** to permanently delete.
