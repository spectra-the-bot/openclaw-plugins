---
"@spectratools/native-scheduler": patch
---

Fix `getDisabledMap()` regex for `launchctl print-disabled` output on macOS 12+

The previous regex (`"([^"]+)"\s*=\s*(true|false);`) never matched the actual
`launchctl print-disabled gui/<uid>` output, which uses the format:

```
"dev.openclaw.native-scheduler.foo" => enabled
"dev.openclaw.native-scheduler.bar" => disabled
```

As a result, `getDisabledMap()` always returned `{}`, causing `summarize()` to
always report `disabled: false` regardless of actual launchd state. This meant
`native_scheduler list` and `native_scheduler get` showed every job as enabled
even when disabled.

Updated regex to `"([^"]+)"\s*=>\s*(enabled|disabled)` with value mapping
`match[2] === "disabled"` to correctly reflect the launchd override database.
