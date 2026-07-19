---
"@spectratools/sentinel": minor
---

Migrate Sentinel to the OpenClaw 2026.7.x Plugin SDK.

- Import `jsonResult` from `openclaw/plugin-sdk/core` instead of the
  `openclaw/plugin-sdk` barrel, which no longer re-exports it in 2026.7.x.
- Replace the removed per-channel `runtime.channel.<channel>.sendMessage<Channel>()`
  senders with adapter-based outbound delivery via
  `api.runtime.channel.outbound.loadAdapter(channel).sendText({ cfg, to, text, accountId? })`,
  matching the pattern OpenClaw core uses. Unloaded channels are treated as
  failed delivery targets, preserving prior error handling.
- Raise the OpenClaw baseline: `peerDependencies.openclaw` to `>=2026.7.1` and
  pin the dev dependency to the `2026.7.1` release (the npm `latest` tag still
  points at the older `2026.7.1-2` prerelease).

No change to watcher behavior or security/network restrictions.
