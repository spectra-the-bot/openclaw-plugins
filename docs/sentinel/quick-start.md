# Quick Start

Create a minimal HTTP watcher that fires when a health endpoint returns a non-ok status.

## 1. Configure allowed hosts

In `openclaw.json`:

```json
{
  "plugins": {
    "sentinel": {
      "allowedHosts": ["api.example.com"]
    }
  }
}
```

## 2. Create a watcher

Use the `sentinel_control` tool:

```json
{
  "action": "create",
  "watcher": {
    "id": "example-health",
    "skillId": "my-monitoring",
    "enabled": true,
    "strategy": "http-poll",
    "endpoint": "https://api.example.com/health",
    "intervalMs": 60000,
    "match": "all",
    "conditions": [
      {
        "path": "$.status",
        "op": "neq",
        "value": "ok"
      }
    ],
    "fire": {
      "webhookPath": "/hooks/sentinel",
      "eventName": "health-degraded",
      "payloadTemplate": {
        "status": "${$.status}",
        "endpoint": "https://api.example.com/health"
      },
      "operatorGoal": "Alert the user that the health endpoint is degraded and suggest investigation steps."
    },
    "retry": {
      "maxRetries": 3,
      "baseMs": 1000,
      "maxMs": 10000
    }
  }
}
```

## 3. What happens on match

When `$.status` is not `"ok"`:

1. Sentinel fires a webhook to the gateway at `localDispatchBase + webhookPath`.
2. The gateway creates an isolated callback session keyed by `hookSessionPrefix` + watcher segments.
3. The callback session receives the event with matched data.
4. The agent can use `sentinel_act` to run commands or send notifications, or `sentinel_escalate` to flag the situation for human review.

## Condition operators

| Operator | Description |
|---|---|
| `eq` | Equal |
| `neq` | Not equal |
| `gt` / `gte` | Greater than / greater than or equal |
| `lt` / `lte` | Less than / less than or equal |
| `exists` | Path exists in response |
| `absent` | Path does not exist |
| `contains` | String/array contains value |
| `matches` | Regex match |
| `changed` | Value changed since last poll |

## Fire-once watchers

Set `fireOnce: true` to disable the watcher after its first match — useful for one-shot alerts:

```json
{
  "fireOnce": true,
  "conditions": [
    { "path": "$.price", "op": "lt", "value": 100 }
  ]
}
```

## EVM contract call example

Monitor an on-chain balance:

```json
{
  "strategy": "evm-call",
  "endpoint": "https://api.mainnet.abs.xyz",
  "intervalMs": 300000,
  "evmCall": {
    "to": "0xTokenAddress...",
    "signature": "function balanceOf(address) view returns (uint256)",
    "args": ["0xYourAddress..."]
  },
  "conditions": [
    { "path": "$[0]", "op": "lt", "value": "1000000000000000000" }
  ]
}
```
