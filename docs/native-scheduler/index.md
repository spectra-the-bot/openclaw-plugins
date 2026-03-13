# native-scheduler

The native-scheduler plugin lets OpenClaw agents manage OS-level scheduled jobs — launchd on macOS, systemd timers on Linux, cron as a fallback, and Windows Task Scheduler on Windows.

## Why native scheduling?

OpenClaw's built-in cron system runs tasks through the agent loop, consuming LLM tokens on every tick. For deterministic scripts (health checks, notifications, data collection), that's wasteful. native-scheduler runs scripts directly through the OS scheduler and only invokes the agent when the script's output demands it.

## How it works

1. The agent calls the `native_scheduler` tool with an `upsert` action and a job definition.
2. The plugin materializes a **wrapper runner** script that handles stdin/stdout contract enforcement, health tracking, and failure callbacks.
3. The wrapper + job are registered with the platform's native scheduler.
4. On each trigger, the wrapper pipes a `NativeSchedulerRunContext` to the script's stdin and parses the script's stdout as a `NativeSchedulerResult`.
5. Based on the result type (`noop`, `prompt`, or `message`), the wrapper either does nothing, triggers an agent session, or delivers a message directly to a channel — all without burning tokens for the decision logic.

## Key features

- **Cross-platform**: launchd, systemd, cron, Windows Task Scheduler
- **Typed script contract**: Scripts receive structured input and return structured output via `@spectratools/native-scheduler-types`
- **Zero-token message delivery**: `message` results go directly to channels without an LLM turn
- **Health tracking**: Per-job health files with success/failure counts, streaks, and timestamps
- **Failure callbacks**: Configurable actions on script crash or timeout (run a command or fire an OpenClaw event)
- **12 tool actions**: Full lifecycle management from the agent

## Next steps

- [Script Contract](./script-contract) — Input/output types your scripts must follow
- [Tool Actions](./tool-actions) — All 12 actions with parameters
- [Examples](./examples) — Annotated example scripts
- [Platform Support](./platform-support) — Backend-specific notes
