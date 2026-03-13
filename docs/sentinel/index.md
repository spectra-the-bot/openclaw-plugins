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

### Limits

Nested under `limits`:

| Field | Default | Description |
|---|---|---|
| `maxWatchersTotal` | `200` | Max watchers across all skills |
| `maxWatchersPerSkill` | `20` | Max watchers per skill |
| `maxConditionsPerWatcher` | `25` | Max conditions per watcher |
| `maxIntervalMsFloor` | `1000` | Minimum polling interval (ms) |

## Tools

Sentinel provides three tools:

- **`sentinel_control`** — Create, enable, disable, remove, and inspect watchers
- **`sentinel_act`** — Execute actions in response to callbacks (run commands, send notifications)
- **`sentinel_escalate`** — Escalate situations that need human attention

## Next steps

- [Quick Start](./quick-start) — Create your first watcher
