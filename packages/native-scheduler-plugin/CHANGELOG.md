# @spectratools/native-scheduler

## 0.2.0

### Minor Changes

- [#11](https://github.com/spectra-the-bot/openclaw-plugins/pull/11) [`0aa58cc`](https://github.com/spectra-the-bot/openclaw-plugins/commit/0aa58ccd40dedf0cbf57b8f7ba881061b4b10fc6) Thanks [@spectra-the-bot](https://github.com/spectra-the-bot)! - Data directory now resolves relative to `$OPENCLAW_STATE_DIR` (or `$CLAWDBOT_STATE_DIR`) instead of hardcoding `~/.openclaw`. Deployments with a custom OpenClaw state directory will now use the correct data path automatically.

### Patch Changes

- [#18](https://github.com/spectra-the-bot/openclaw-plugins/pull/18) [`02d3a34`](https://github.com/spectra-the-bot/openclaw-plugins/commit/02d3a34ca6ebda37d94d759da48d887736601ad1) Thanks [@spectra-the-bot](https://github.com/spectra-the-bot)! - Auto-resolve user login shell PATH at upsert time for launchd backend.

- [#16](https://github.com/spectra-the-bot/openclaw-plugins/pull/16) [`0edfb8c`](https://github.com/spectra-the-bot/openclaw-plugins/commit/0edfb8cee0b8bb06e08353705cbbc152c0a55eda) Thanks [@spectra-the-bot](https://github.com/spectra-the-bot)! - Add plugin-shipped SKILL.md to native-scheduler-plugin.

- [#24](https://github.com/spectra-the-bot/openclaw-plugins/pull/24) [`eef861c`](https://github.com/spectra-the-bot/openclaw-plugins/commit/eef861c874f129a7f6eea0a2a2d6fcbe4aef08a8) Thanks [@spectra-the-bot](https://github.com/spectra-the-bot)! - docs: add package READMEs for native-scheduler and sentinel
