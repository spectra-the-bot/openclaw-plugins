# @spectratools/native-scheduler

## 1.1.0

### Minor Changes

- [#32](https://github.com/spectra-the-bot/openclaw-plugins/pull/32) [`67828f1`](https://github.com/spectra-the-bot/openclaw-plugins/commit/67828f1ef02a513b0a89beb390b6d3a838a58b45) Thanks [@spectra-the-bot](https://github.com/spectra-the-bot)! - Add pre-rendered Mermaid diagrams to documentation. Diagrams are rendered to static SVGs at build time via `@mermaid-js/mermaid-cli`, avoiding the ~500KB client-side Mermaid.js bundle. Added flow diagrams to native-scheduler overview, script contract result delivery, platform auto-detection, sentinel overview, and callback flow pages.

### Patch Changes

- [#30](https://github.com/spectra-the-bot/openclaw-plugins/pull/30) [`d9c35f0`](https://github.com/spectra-the-bot/openclaw-plugins/commit/d9c35f09315a2e645bcbdf05c653a0405f41bc06) Thanks [@spectra-the-bot](https://github.com/spectra-the-bot)! - Document `OPENCLAW_RESULT_FILE` script result delivery contract in SKILL.md

## 1.0.0

### Major Changes

- [#27](https://github.com/spectra-the-bot/openclaw-plugins/pull/27) [`401bf34`](https://github.com/spectra-the-bot/openclaw-plugins/commit/401bf344a42787c91e3d9cb4dc345f19002136a1) Thanks [@spectra-the-bot](https://github.com/spectra-the-bot)! - Inject `OPENCLAW_RESULT_FILE` environment variable for result delivery. Scripts can now write their result JSON to this file instead of stdout, allowing free use of stdout for debug/log output. The runner reads the file first; if absent or invalid, falls back to stdout parsing (backward compatible).

### Patch Changes

- Updated dependencies [[`401bf34`](https://github.com/spectra-the-bot/openclaw-plugins/commit/401bf344a42787c91e3d9cb4dc345f19002136a1)]:
  - @spectratools/native-scheduler-types@1.0.0

## 0.2.0

### Minor Changes

- [#11](https://github.com/spectra-the-bot/openclaw-plugins/pull/11) [`0aa58cc`](https://github.com/spectra-the-bot/openclaw-plugins/commit/0aa58ccd40dedf0cbf57b8f7ba881061b4b10fc6) Thanks [@spectra-the-bot](https://github.com/spectra-the-bot)! - Data directory now resolves relative to `$OPENCLAW_STATE_DIR` (or `$CLAWDBOT_STATE_DIR`) instead of hardcoding `~/.openclaw`. Deployments with a custom OpenClaw state directory will now use the correct data path automatically.

### Patch Changes

- [#18](https://github.com/spectra-the-bot/openclaw-plugins/pull/18) [`02d3a34`](https://github.com/spectra-the-bot/openclaw-plugins/commit/02d3a34ca6ebda37d94d759da48d887736601ad1) Thanks [@spectra-the-bot](https://github.com/spectra-the-bot)! - Auto-resolve user login shell PATH at upsert time for launchd backend.

- [#16](https://github.com/spectra-the-bot/openclaw-plugins/pull/16) [`0edfb8c`](https://github.com/spectra-the-bot/openclaw-plugins/commit/0edfb8cee0b8bb06e08353705cbbc152c0a55eda) Thanks [@spectra-the-bot](https://github.com/spectra-the-bot)! - Add plugin-shipped SKILL.md to native-scheduler-plugin.

- [#24](https://github.com/spectra-the-bot/openclaw-plugins/pull/24) [`eef861c`](https://github.com/spectra-the-bot/openclaw-plugins/commit/eef861c874f129a7f6eea0a2a2d6fcbe4aef08a8) Thanks [@spectra-the-bot](https://github.com/spectra-the-bot)! - docs: add package READMEs for native-scheduler and sentinel
