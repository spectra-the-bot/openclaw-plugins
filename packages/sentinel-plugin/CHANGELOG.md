# @spectratools/sentinel

## 1.0.2

### Patch Changes

- [#37](https://github.com/spectra-the-bot/openclaw-plugins/pull/37) [`59e0fb2`](https://github.com/spectra-the-bot/openclaw-plugins/commit/59e0fb27e25f23e3593ddcd5e814e58e74897cdb) Thanks [@spectra-the-bot](https://github.com/spectra-the-bot)! - fix: sync openclaw.plugin.json version with package.json

  Both native-scheduler and sentinel had stale versions in their
  openclaw.plugin.json manifests. Updated to match package.json and
  added tests to prevent future drift.

- [#42](https://github.com/spectra-the-bot/openclaw-plugins/pull/42) [`14d3e78`](https://github.com/spectra-the-bot/openclaw-plugins/commit/14d3e78bfc330ca232725a9c2197e6eecfd08497) Thanks [@spectra-the-bot](https://github.com/spectra-the-bot)! - Add pre-publish manifest sync checks to prevent version drift between package.json and openclaw.plugin.json.

## 1.0.1

### Patch Changes

- [`a85f66e`](https://github.com/spectra-the-bot/openclaw-plugins/commit/a85f66e2f81cb9904cdb96fd7e5e3ccb7af957fe) Thanks [@spectra-the-bot](https://github.com/spectra-the-bot)! - fix(sentinel): update homepage to docs site (plugins.spectratools.dev/sentinel/)

## 1.0.0

### Major Changes

- [#11](https://github.com/spectra-the-bot/openclaw-plugins/pull/11) [`0aa58cc`](https://github.com/spectra-the-bot/openclaw-plugins/commit/0aa58ccd40dedf0cbf57b8f7ba881061b4b10fc6) Thanks [@spectra-the-bot](https://github.com/spectra-the-bot)! - **Breaking:** `operatorGoalFile` now requires a relative path within sentinel's managed data directory (`dataDir`), not an arbitrary absolute path. This fixes a security issue where watcher creators could read any local file.

  **Migration:** Copy your operator goal files to `~/.openclaw/data/sentinel/operator-goals/` (or your configured `dataDir`) and update `operatorGoalFile` references to relative paths (e.g. `"my-policy.md"` instead of `"/path/to/my-policy.md"`).

  **New:** `dataDir` config field (default: `$OPENCLAW_STATE_DIR/data/sentinel`) — sentinel now owns a dedicated workspace for state and goal files. `operatorGoalContent` parameter on `sentinel_control` create action for inline goal file creation.

### Patch Changes

- [#24](https://github.com/spectra-the-bot/openclaw-plugins/pull/24) [`eef861c`](https://github.com/spectra-the-bot/openclaw-plugins/commit/eef861c874f129a7f6eea0a2a2d6fcbe4aef08a8) Thanks [@spectra-the-bot](https://github.com/spectra-the-bot)! - docs: add package READMEs for native-scheduler and sentinel

- [#15](https://github.com/spectra-the-bot/openclaw-plugins/pull/15) [`cd92955`](https://github.com/spectra-the-bot/openclaw-plugins/commit/cd92955ecac8010b6d86c971b35cbd92316ed482) Thanks [@spectra-the-bot](https://github.com/spectra-the-bot)! - Add plugin-shipped SKILL.md to sentinel-plugin.

- [#17](https://github.com/spectra-the-bot/openclaw-plugins/pull/17) [`b3f6b24`](https://github.com/spectra-the-bot/openclaw-plugins/commit/b3f6b2480f465aeabc4679f9643de3f096908f3e) Thanks [@spectra-the-bot](https://github.com/spectra-the-bot)! - Surface state load errors instead of silently returning empty state; atomic writes.
