# approval-gate

`@spectratools/approval-gate` adds declarative, human-in-the-loop gates to OpenClaw tool calls. Each
rule matches one exact agent id and exact tool name. Matching calls must pass configured parameter
checks and then receive a critical one-shot approval before execution.

## Install

```bash
openclaw plugins install @spectratools/approval-gate
openclaw plugins enable approval-gate
```

## Example

```json5
{
  plugins: {
    entries: {
      "approval-gate": {
        enabled: true,
        config: {
          rules: [
            {
              id: "production-deploy",
              agentId: "release",
              toolName: "deploy__production",
              approvalTitle: "Approve production deploy",
              checks: [
                { parameter: "request_id", kind: "uuid" },
                {
                  parameter: "region",
                  kind: "allowlist",
                  allowedValues: ["us-east-1", "us-west-2"],
                },
                { parameter: "artifact", kind: "present" },
              ],
              summaryFields: [
                { parameter: "artifact", label: "Artifact", redaction: "none" },
                { parameter: "request_id", label: "Request", redaction: "suffix6" },
              ],
            },
          ],
        },
      },
    },
  },
}
```

## Evaluation behavior

1. Rules match `agentId` and `toolName` with exact, case-sensitive equality.
2. Every matching rule applies. Any failing check blocks the call without exposing the rejected
   value.
3. Only explicitly configured primitive `summaryFields` are included in the approval prompt.
4. The approval is always `critical`, permits only `allow-once` or `deny`, expires after 10 minutes,
   and treats timeout as deny.

Calls with no matching rule bypass the plugin. An empty rules array therefore gates nothing.

## Parameter checks

| Kind | Behavior |
|---|---|
| `present` | Requires a value other than `null`, `undefined`, or an empty string |
| `uuid` | Requires a canonical UUID (versions 1–5) |
| `allowlist` | Requires exact string equality with an `allowedValues` entry |

Parameter names may be top-level keys or dot-separated own-property paths.

## Safe summaries

Up to eight explicitly configured fields may appear in a prompt:

| Redaction | Behavior |
|---|---|
| `none` | Sanitized primitive value capped at 64 characters |
| `last4` | Last four characters only, prefixed by `••`; short values are fully masked |
| `suffix6` | At most the last six characters, prefixed by `…` |

Objects, arrays, missing values, and non-finite numbers are omitted. Titles are capped at 80
characters and descriptions at 256. The plugin never logs raw tool parameters.

::: warning
`none` intentionally discloses the selected primitive value to the approval recipient. Configure it
only for fields that are safe to display.
:::

## Multiple rules

Use separate rules for separate agent/tool pairs. If rules overlap on the same pair, their checks are
additive and all must pass. Summary fields are collected in configuration order, still subject to the
global eight-field and 256-character bounds.
