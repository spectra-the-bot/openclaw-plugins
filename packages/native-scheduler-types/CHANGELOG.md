# @spectratools/native-scheduler-types

## 1.0.0

### Major Changes

- [#27](https://github.com/spectra-the-bot/openclaw-plugins/pull/27) [`401bf34`](https://github.com/spectra-the-bot/openclaw-plugins/commit/401bf344a42787c91e3d9cb4dc345f19002136a1) Thanks [@spectra-the-bot](https://github.com/spectra-the-bot)! - Inject `OPENCLAW_RESULT_FILE` environment variable for result delivery. Scripts can now write their result JSON to this file instead of stdout, allowing free use of stdout for debug/log output. The runner reads the file first; if absent or invalid, falls back to stdout parsing (backward compatible).
