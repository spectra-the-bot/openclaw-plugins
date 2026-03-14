---
"@spectratools/native-scheduler": patch
"@spectratools/sentinel": patch
---

fix: sync openclaw.plugin.json version with package.json

Both native-scheduler and sentinel had stale versions in their
openclaw.plugin.json manifests. Updated to match package.json and
added tests to prevent future drift.
