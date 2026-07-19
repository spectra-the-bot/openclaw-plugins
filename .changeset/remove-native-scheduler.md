---
---

Remove the superseded `@spectratools/native-scheduler` and
`@spectratools/native-scheduler-types` packages.

Every OpenClaw-integrated capability the native-scheduler plugin provided is now
covered by OpenClaw's built-in cron scheduler (command payloads, zero-token
channel delivery, failure alerts, run history, enable/disable/run lifecycle).
See `packages/sentinel-plugin/COMPATIBILITY.md` and the PR description for the
full feature-by-feature supersession analysis.

No published package is version-bumped by this change (empty changeset): the two
packages are removed from the monorepo, and the remaining `@spectratools/sentinel`
package source is unchanged.
