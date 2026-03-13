# Tool Actions

The `native_scheduler` tool exposes 12 actions for full job lifecycle management. All actions share these common parameters:

| Parameter | Type | Description |
|---|---|---|
| `action` | string (required) | One of the 12 actions below |
| `backend` | string | `auto` (default), `launchd`, `cron`, `systemd`, `windows-task-scheduler` |
| `namespace` | string | Override the configured namespace |

## `status`

Returns backend detection info, current namespace, and data directory path.

**Additional params:** none

## `list`

Lists all managed jobs for the current backend and namespace.

**Additional params:** none

## `get`

Returns details for a single job.

| Parameter | Type | Description |
|---|---|---|
| `id` | string (required) | Job identifier |

## `upsert`

Creates or updates a job. The plugin materializes a wrapper runner and registers the job with the native scheduler.

| Parameter | Type | Description |
|---|---|---|
| `job` | object (required) | Job definition (see below) |

### Job schema

| Field | Type | Description |
|---|---|---|
| `id` | string (required) | Stable job identifier |
| `description` | string | Human-readable description |
| `command` | string[] (required) | Executable followed by arguments |
| `workingDirectory` | string | Working directory for the script |
| `environment` | Record\<string, string\> | Environment variables |
| `runAtLoad` | boolean | Run immediately when loaded (launchd) |
| `startIntervalSeconds` | integer (≥ 1) | Simple recurring interval |
| `calendar` | CalendarEntry[] | Calendar schedule entries |
| `stdoutPath` | string | Path for stdout log |
| `stderrPath` | string | Path for stderr log |
| `disabled` | boolean | Whether the job starts disabled |
| `failureCallback` | object | Action on script failure |
| `defaultFailureResult` | object | Result to fire on crash/timeout |

### CalendarEntry

| Field | Type | Range |
|---|---|---|
| `minute` | integer | 0–59 |
| `hour` | integer | 0–23 |
| `day` | integer | 1–31 |
| `weekday` | integer | 0–7 (0 and 7 = Sunday) |
| `month` | integer | 1–12 |

### failureCallback

Two types:

**Command callback:**
```json
{
  "type": "command",
  "command": ["notify-send", "Job failed"],
  "environment": { "JOB_ID": "my-job" }
}
```

**OpenClaw event callback:**
```json
{
  "type": "openclaw-event",
  "text": "Job failed — investigate",
  "mode": "now"
}
```

## `remove`

Removes a job from the native scheduler and cleans up wrapper artifacts.

| Parameter | Type | Description |
|---|---|---|
| `id` | string (required) | Job identifier |

## `run`

Triggers an immediate execution of a job.

| Parameter | Type | Description |
|---|---|---|
| `id` | string (required) | Job identifier |

## `enable`

Enables a previously disabled job.

| Parameter | Type | Description |
|---|---|---|
| `id` | string (required) | Job identifier |

## `disable`

Disables a job without removing it.

| Parameter | Type | Description |
|---|---|---|
| `id` | string (required) | Job identifier |

## `health`

Returns health data for a job or all jobs in the namespace.

| Parameter | Type | Description |
|---|---|---|
| `id` | string | Job identifier. If omitted, returns health for all jobs |

Health data includes success/failure counts, streaks, last run timestamp, and overall status.

## `last-run`

Returns the most recent run status for a job.

| Parameter | Type | Description |
|---|---|---|
| `id` | string (required) | Job identifier |

## `failures`

Lists recent failure runs for a job.

| Parameter | Type | Description |
|---|---|---|
| `id` | string (required) | Job identifier |
| `limit` | integer (1–100) | Max failures to return (default 10) |

## `logs`

Returns tail of stdout/stderr logs for a job.

| Parameter | Type | Description |
|---|---|---|
| `id` | string (required) | Job identifier |
| `lines` | integer (1–500) | Number of log lines (default 50) |
