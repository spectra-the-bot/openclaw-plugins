# Sentinel — OpenClaw compatibility

## Supported / tested

- Built and tested against the OpenClaw Plugin SDK pinned in this repo's
  `pnpm-lock.yaml` (`openclaw@2026.7.1`).
- `package.json` declares `peerDependencies.openclaw: ">=2026.7.1"`.

> Note: the npm `latest` dist-tag currently resolves to the older prerelease
> `2026.7.1-2`, which predates the finalized 2026.7.1 outbound/`core` API. The
> dev dependency is therefore pinned to the exact `2026.7.1` release that the
> runtime ships.

## Why sentinel is not superseded by native cron

OpenClaw's built-in cron gained **event triggers (condition watchers)** — a
headless condition script attached to an `every`/`cron` schedule that runs its
payload only when the script returns `fire: true`
(`docs/automation/cron-jobs.md`, "Event triggers"). That covers the
**HTTP-poll + condition → fire** case.

Sentinel provides capabilities cron event triggers do **not**:

- **Persistent streaming strategies** — `websocket`, `sse`, and `http-long-poll`.
  Cron event triggers are interval-evaluated (min 30s) and cannot hold a
  persistent connection.
- **`evm-call`** — Ethereum contract reads via `eth_call`.
- **Declarative, security-scoped watchers** — JSONPath conditions plus
  `allowedHosts`, redirect rejection, and private/reserved-IP blocking. Cron
  event triggers run imperative JS with the owning agent's **full tool policy,
  including `exec`** (documented as unattended code execution; disabled by
  default via `cron.triggers.enabled`).
- **Relay contract** — isolated callback session with `operatorGoal`,
  `sentinel_act`/`sentinel_escalate`, and a timeout fallback.

Conclusion: sentinel is retained.

## OpenClaw 2026.7.x Plugin SDK migration (applied)

Two breaking Plugin SDK changes landed in the 2026.7.x line. Both are now
migrated in-tree and validated by typecheck and the unit suite against
`openclaw@2026.7.1`:

1. **`jsonResult` moved out of the `openclaw/plugin-sdk` barrel.** It is now
   exported from `openclaw/plugin-sdk/core` (also re-exported from
   `/tool-results` and `/channel-actions`). `src/tool.ts` and
   `src/actionTools.ts` import it from `openclaw/plugin-sdk/core`. The value
   type helpers (`AnyAgentTool`, `OpenClawPluginApi`,
   `OpenClawPluginConfigSchema`, `ChannelId`) remain on the barrel.
2. **`runtime.channel` per-channel senders removed.** The old
   `api.runtime.channel.<channel>.sendMessage<Channel>(...)` surface is gone;
   2026.7.x exposes adapter-based outbound via
   `api.runtime.channel.outbound.loadAdapter(channel)`, whose
   `ChannelOutboundAdapter.sendText({ cfg, to, text, accountId? })` performs
   the zero-token delivery. `src/index.ts` and `src/actionTools.ts` now load
   the channel outbound adapter and call `sendText`, mirroring the pattern used
   by OpenClaw core (`dist/notify-*.js`, device-pair notifications). When a
   channel adapter is not loaded, `loadAdapter` returns `undefined` and the
   delivery is treated as a failed target, preserving prior error handling.

No Sentinel behavior or security/network restrictions changed: watcher
strategies, `allowedHosts`, redirect/IP guards, and the relay callback contract
are untouched.
