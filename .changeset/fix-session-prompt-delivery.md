---
"@spectratools/native-scheduler": minor
---

Fix session-targeted prompt delivery: use plugin HTTP route + subagent.run() instead of non-existent gateway /api/v1/sessions/send endpoint.
