# Getting Started

## Prerequisites

- [OpenClaw](https://github.com/coffeexcoin/openclaw) installed and running
- Node.js ≥ 22
- pnpm (recommended) or npm

## Installing approval-gate

```bash
openclaw plugins install @spectratools/approval-gate
```

Configure exact agent/tool rules under the `approval-gate` plugin entry. See the
[approval-gate guide](/approval-gate/) for checks and summary redaction options.

## Installing sentinel

```bash
openclaw plugins install @spectratools/sentinel
```

Configure in `openclaw.json`:

```json
{
  "plugins": {
    "sentinel": {
      "allowedHosts": ["api.example.com"],
      "localDispatchBase": "http://127.0.0.1:18789"
    }
  }
}
```

The `allowedHosts` array is required — no hosts are allowed by default as a security measure.

## Minimal sentinel watcher

Use the `sentinel_control` tool:

```json
{
  "action": "create",
  "watcher": {
    "id": "health-check",
    "skillId": "my-skill",
    "enabled": true,
    "strategy": "http-poll",
    "endpoint": "https://api.example.com/health",
    "intervalMs": 60000,
    "match": "all",
    "conditions": [
      { "path": "$.status", "op": "neq", "value": "ok" }
    ],
    "fire": {
      "webhookPath": "/hooks/sentinel",
      "eventName": "health-degraded",
      "payloadTemplate": { "status": "${$.status}" }
    },
    "retry": { "maxRetries": 3, "baseMs": 1000, "maxMs": 10000 }
  }
}
```
