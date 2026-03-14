# sentinel

The sentinel plugin provides declarative endpoint monitoring for OpenClaw agents. Define watchers that poll HTTP endpoints, listen to WebSocket/SSE streams, or call EVM smart contracts — and fire callbacks when conditions are met.

For full upstream documentation, see [coffeexcoin/openclaw-sentinel](https://github.com/coffeexcoin/openclaw-sentinel).

## How it works

1. Define a **watcher** with an endpoint, polling strategy, and conditions.
2. Sentinel evaluates JSONPath conditions against each response.
3. When conditions match, sentinel fires a webhook to the OpenClaw gateway, which routes it to a callback session.
4. The callback session receives the event with matched data and can execute actions via `sentinel_act` or escalate via `sentinel_escalate`.

## Strategies

| Strategy | Description |
|---|---|
| `http-poll` | Periodic HTTP GET/POST polling |
| `websocket` | Persistent WebSocket connection |
| `sse` | Server-Sent Events stream |
| `http-long-poll` | HTTP long-polling |
| `evm-call` | EVM `eth_call` against a smart contract |

## Configuration

Configure in `openclaw.json` under `plugins.sentinel`:

| Field | Type | Default | Description |
|---|---|---|---|
| `allowedHosts` | string[] | `[]` | Hostnames watchers can connect to (required) |
| `localDispatchBase` | string | `http://127.0.0.1:18789` | Base URL for webhook dispatch |
| `dispatchAuthToken` | string | (auto-detected) | Bearer token for dispatch auth |
| `hookSessionPrefix` | string | `agent:main:hooks:sentinel` | Base prefix for callback sessions |
| `hookSessionGroup` | string | — | Default session group for callbacks |
| `hookRelayDedupeWindowMs` | integer | `120000` | Dedupe window for relay messages |
| `stateFilePath` | string | (default) | Custom state persistence path |
| `notificationPayloadMode` | `none` \| `concise` \| `debug` | `concise` | Delivery target notification verbosity |
| `maxOperatorGoalChars` | integer | `12000` | Max chars for `fire.operatorGoal` |
| `hookResponseTimeoutMs` | integer | `30000` | Timeout for assistant hook response |
| `hookResponseFallbackMode` | `none` \| `concise` | `concise` | Fallback on hook response timeout |
| `hookResponseDedupeWindowMs` | integer | `120000` | Hook response delivery dedupe window |
| `defaultHookModel` | string | (gateway default) | Default LLM model for hook callback sessions |
| `dataDir` | string | (plugin default) | Managed directory for state file and operatorGoalFile references |

### Limits

Nested under `limits`:

| Field | Default | Description |
|---|---|---|
| `maxWatchersTotal` | `200` | Max watchers across all skills |
| `maxWatchersPerSkill` | `20` | Max watchers per skill |
| `maxConditionsPerWatcher` | `25` | Max conditions per watcher |
| `maxIntervalMsFloor` | `1000` | Minimum polling interval (ms) |

### fire config

| Field | Type | Description |
|---|---|---|
| `webhookPath` | string | Gateway path for webhook dispatch |
| `eventName` | string | Event name in the callback envelope |
| `payloadTemplate` | object | Key-value template with `${JSONPath}` interpolation |
| `operatorGoal` | string | Natural language instruction for the callback agent (max `maxOperatorGoalChars` chars) |
| `operatorGoalFile` | string | Path to a file read fresh at fire time — contents injected as `operatorGoalRuntimeContext` in the callback envelope (use for dynamic policy/config) |
| `model` | string | Per-watcher LLM model override for hook sessions (takes precedence over `defaultHookModel`) |
| `sessionGroup` | string | Optional hook session group key (watchers with the same key share one callback session) |
| `dedupeKeyTemplate` | string | Template to derive deterministic trigger dedupe key |
| `priority` | `low \| normal \| high \| critical` | Callback urgency hint |
| `fireOnce` | boolean | Disable the watcher after first fire |

## Tools

Sentinel provides three tools:

- **`sentinel_control`** — Create, enable, disable, remove, and inspect watchers
- **`sentinel_act`** — Execute actions in response to callbacks (run commands, send notifications)
- **`sentinel_escalate`** — Escalate situations that need human attention

## Next steps

- [Quick Start](./quick-start) — Create your first watcher
- [Callbacks & Hook Sessions](./callbacks) — How callback sessions work

## Agent skill

The sentinel plugin ships a `SKILL.md` that surfaces usage guidance to AI agents via OpenClaw's skill system. When the plugin is enabled, agents can load the skill to get:

- When to use `sentinel_control` vs other monitoring approaches
- The strategy/condition/fire schema in plain terms
- Relay contract semantics (`sentinel_act` vs `sentinel_escalate`)
- Watcher lifecycle guidance
