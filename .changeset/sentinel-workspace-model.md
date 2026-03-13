---
"@spectratools/sentinel": major
---

**Breaking:** `operatorGoalFile` now requires a relative path within sentinel's managed data directory (`dataDir`), not an arbitrary absolute path. This fixes a security issue where watcher creators could read any local file.

**Migration:** Copy your operator goal files to `~/.openclaw/data/sentinel/operator-goals/` (or your configured `dataDir`) and update `operatorGoalFile` references to relative paths (e.g. `"my-policy.md"` instead of `"/path/to/my-policy.md"`).

**New:** `dataDir` config field (default: `$OPENCLAW_STATE_DIR/data/sentinel`) — sentinel now owns a dedicated workspace for state and goal files. `operatorGoalContent` parameter on `sentinel_control` create action for inline goal file creation.
