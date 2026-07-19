# Sentinel — OpenClaw compatibility

## Supported / tested

- Built and tested against the OpenClaw Plugin SDK pinned in this repo's
  `pnpm-lock.yaml` (`openclaw@2026.3.11`).
- `package.json` declares `peerDependencies.openclaw: ">=2026.3.2"`.

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

## Known incompatibilities with OpenClaw ≥ 2026.7.x (follow-up)

Typechecking sentinel against `openclaw@2026.7.1` surfaces two breaking Plugin
SDK changes. These require a live-gateway-validated migration and are tracked
as follow-up (not applied here, to keep this change bounded and the repo green
on its supported SDK):

1. **`jsonResult` moved out of the `openclaw/plugin-sdk` barrel.** In 2026.7.x
   it is exported from `openclaw/plugin-sdk/core` (also `/tool-results`,
   `/channel-actions`). `src/tool.ts` and `src/actionTools.ts` import it from
   the barrel.
2. **`runtime.channel` per-channel senders removed.** 2026.3.x exposed
   `api.runtime.channel.<channel>.sendMessage<Channel>(...)`; 2026.7.x replaces
   that with adapter-based outbound (`runtime.channel.outbound.loadAdapter`,
   `openclaw/plugin-sdk/channel-outbound`). `src/index.ts` and
   `src/actionTools.ts` use the removed per-channel senders for zero-token
   delivery.

Migrating requires bumping the pinned SDK, reworking delivery onto the outbound
adapter API, and validating against a running 2026.7.x gateway.
