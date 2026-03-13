---
"@spectratools/native-scheduler": minor
---

Data directory now resolves relative to `$OPENCLAW_STATE_DIR` (or `$CLAWDBOT_STATE_DIR`) instead of hardcoding `~/.openclaw`. Deployments with a custom OpenClaw state directory will now use the correct data path automatically.
