# Getting Started

## Prerequisites

- [OpenClaw](https://github.com/coffeexcoin/openclaw) installed and running
- Node.js ≥ 22
- pnpm (recommended) or npm

## Installing native-scheduler

```bash
openclaw plugin install @spectratools/native-scheduler
```

Configure in `openclaw.json`:

```json
{
  "plugins": {
    "native-scheduler": {
      "defaultBackend": "auto",
      "namespace": "my-agent"
    }
  }
}
```

| Option | Description | Default |
|---|---|---|
| `defaultBackend` | Scheduler backend: `auto`, `launchd`, `systemd`, `cron`, `windows-task-scheduler` | `auto` |
| `namespace` | Prefix for managed job names | (plugin default) |
| `dataDir` | Directory for wrapper state files (health, run history) | OS-appropriate default |

## Installing sentinel

```bash
openclaw plugin install @spectratools/sentinel-plugin
```

Configure in `openclaw.json`:

```json
{
  "plugins": {
    "openclaw-sentinel": {
      "allowedHosts": ["api.example.com"],
      "localDispatchBase": "http://127.0.0.1:18789"
    }
  }
}
```

The `allowedHosts` array is required — no hosts are allowed by default as a security measure.

## Minimal native-scheduler job

Use the `native_scheduler` tool to create a job:

```json
{
  "action": "upsert",
  "job": {
    "id": "hello",
    "command": ["echo", "hello world"],
    "startIntervalSeconds": 3600
  }
}
```

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
