# @spectratools/sentinel

## 1.0.0

### Major Changes

- [#11](https://github.com/spectra-the-bot/openclaw-plugins/pull/11) [`0aa58cc`](https://github.com/spectra-the-bot/openclaw-plugins/commit/0aa58ccd40dedf0cbf57b8f7ba881061b4b10fc6) Thanks [@spectra-the-bot](https://github.com/spectra-the-bot)! - **Breaking:** `operatorGoalFile` now requires a relative path within sentinel's managed data directory (`dataDir`), not an arbitrary absolute path. This fixes a security issue where watcher creators could read any local file.

  **Migration:** Copy your operator goal files to `~/.openclaw/data/sentinel/operator-goals/` (or your configured `dataDir`) and update `operatorGoalFile` references to relative paths (e.g. `"my-policy.md"` instead of `"/path/to/my-policy.md"`).

  **New:** `dataDir` config field (default: `$OPENCLAW_STATE_DIR/data/sentinel`) — sentinel now owns a dedicated workspace for state and goal files. `operatorGoalContent` parameter on `sentinel_control` create action for inline goal file creation.

### Patch Changes

- [#15](https://github.com/spectra-the-bot/openclaw-plugins/pull/15) [`cd92955`](https://github.com/spectra-the-bot/openclaw-plugins/commit/cd92955ecac8010b6d86c971b35cbd92316ed482) Thanks [@spectra-the-bot](https://github.com/spectra-the-bot)! - Add plugin-shipped SKILL.md to sentinel-plugin.

- [#17](https://github.com/spectra-the-bot/openclaw-plugins/pull/17) [`b3f6b24`](https://github.com/spectra-the-bot/openclaw-plugins/commit/b3f6b2480f465aeabc4679f9643de3f096908f3e) Thanks [@spectra-the-bot](https://github.com/spectra-the-bot)! - Surface state load errors instead of silently returning empty state; atomic writes.
