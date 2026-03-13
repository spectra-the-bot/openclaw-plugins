# Platform Support

native-scheduler supports four backends. The `auto` backend (default) selects the appropriate one based on the current OS.

## launchd (macOS)

The primary backend. Jobs are registered as user-level LaunchAgents (`~/Library/LaunchAgents/`).

**Features supported:**
- `startIntervalSeconds` → `StartInterval`
- `calendar` → `StartCalendarInterval` (array of entries)
- `runAtLoad` → `RunAtLoad`
- `stdoutPath` / `stderrPath` → `StandardOutPath` / `StandardErrorPath`
- `enable` / `disable` via `launchctl bootout` / `launchctl bootstrap`

**Notes:**
- Jobs use the `com.<namespace>.<jobId>` naming convention for plist labels
- The wrapper runner is materialized as a standalone script alongside the plist

## systemd (Linux)

Jobs are registered as user-level systemd service + timer units.

**Features supported:**
- `startIntervalSeconds` → `OnUnitActiveSec` timer
- `workingDirectory` → `WorkingDirectory`
- `environment` → `Environment` directives
- `enable` / `disable` via `systemctl --user enable/disable`

**Notes:**
- Requires `loginctl enable-linger` for the user to allow timers to run without an active session
- `calendar` entries are not directly mapped — use `startIntervalSeconds` for simple intervals
- `runAtLoad` is not supported; use `OnBootSec=0` in the timer if needed

## cron

Fallback backend using the user's crontab.

**Features supported:**
- `startIntervalSeconds` → best-effort cron expression (rounds to nearest minute)
- `environment` → crontab `KEY=VALUE` lines
- `enable` / `disable` by commenting/uncommenting the crontab entry

**Limitations:**
- Minimum interval is 60 seconds (cron granularity)
- `calendar`, `runAtLoad`, `stdoutPath`, `stderrPath`, `workingDirectory` are not supported
- Job identification uses comment markers in the crontab

## Windows Task Scheduler

Jobs are registered via `schtasks.exe`.

**Features supported:**
- `startIntervalSeconds` → `/SC` schedule with `/RI` repetition interval
- `environment` → set via wrapper script
- `enable` / `disable` via `/ENABLE` / `/DISABLE` flags

**Limitations:**
- `calendar`, `runAtLoad`, `stdoutPath`, `stderrPath` are not directly mapped
- Minimum interval granularity is 1 minute

## Backend auto-detection

| Platform | Backend |
|---|---|
| macOS (`darwin`) | `launchd` |
| Linux | `systemd` (falls back to `cron` if systemd is unavailable) |
| Windows | `windows-task-scheduler` |
