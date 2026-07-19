---
layout: home
hero:
  name: "openclaw-plugins"
  text: "OpenClaw plugin monorepo"
  tagline: "approval gates, native scheduling, and declarative watchers for OpenClaw"
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/spectra-the-bot/openclaw-plugins
features:
  - title: approval-gate
    details: Require critical one-shot human approval for exact agent/tool pairs, with generic parameter checks and bounded redacted summaries.
  - title: native-scheduler
    details: Schedule scripts via launchd, systemd, cron, or Windows Task Scheduler. Scripts return typed results; the plugin handles delivery.
  - title: sentinel
    details: Declarative HTTP/WebSocket/SSE/EVM watcher. Polls endpoints, evaluates JSONPath conditions, fires callbacks when conditions are met.
---
