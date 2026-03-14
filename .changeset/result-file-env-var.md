---
"@spectratools/native-scheduler": major
"@spectratools/native-scheduler-types": major
---

Inject `OPENCLAW_RESULT_FILE` environment variable for result delivery. Scripts can now write their result JSON to this file instead of stdout, allowing free use of stdout for debug/log output. The runner reads the file first; if absent or invalid, falls back to stdout parsing (backward compatible).
