# @spectratools/approval-gate

General-purpose critical approval gates for [OpenClaw](https://openclaw.dev). Configure exact
agent/tool pairs, optional generic parameter checks, and a small explicit set of fields to show in
the human approval prompt.

## Security properties

- **Exact matching only:** `agentId` and `toolName` use case-sensitive equality. There are no
  wildcards, prefixes, or regular expressions.
- **Critical, one-shot approvals:** matching calls offer only `allow-once` and `deny`, time out
  after 10 minutes, and treat timeout as deny.
- **Pre-approval checks:** `present`, canonical `uuid`, and exact-string `allowlist` checks can
  block invalid calls before an approval is created.
- **Explicit summaries:** only configured `summaryFields` are shown. Primitive values are bounded;
  objects and arrays are omitted. Fields support `none`, `last4`, and `suffix6` redaction.
- **No raw parameter logging:** the runtime does not log tool parameter objects or approval
  payloads. Block messages identify the failed rule/check, never the rejected value.
- **Pure policy core:** `policy.ts` has no runtime dependencies and is comprehensively unit-tested.

Overlapping rules for the same exact agent/tool pair are additive: every check must pass, and
summary fields are collected in rule order, up to eight fields total.

## Installation

```bash
openclaw plugins install @spectratools/approval-gate
openclaw plugins enable approval-gate
```

## Configuration

Configure rules under the plugin entry:

```json5
{
  plugins: {
    entries: {
      "approval-gate": {
        enabled: true,
        config: {
          rules: [
            {
              id: "submit-payment",
              agentId: "payments",
              toolName: "payments__submit",
              approvalTitle: "Approve payment submission",
              checks: [
                { parameter: "request_id", kind: "uuid" },
                {
                  parameter: "account_id",
                  kind: "allowlist",
                  allowedValues: ["account-production"],
                },
                { parameter: "amount", kind: "present" },
              ],
              summaryFields: [
                { parameter: "amount", label: "Amount", redaction: "none" },
                { parameter: "account_id", label: "Account", redaction: "last4" },
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

`parameter` supports a top-level key or a dot-separated own-property path such as
`request.metadata.id`. Matching and allowlists do not trim or normalize values.

### Checks

| Kind | Pass condition |
|---|---|
| `present` | Value is not `null`, `undefined`, or an empty string |
| `uuid` | Value is a canonical UUID (versions 1–5) |
| `allowlist` | Value is a string exactly equal to one configured `allowedValues` entry |

### Summary redaction

| Mode | Output |
|---|---|
| `none` | Primitive value, control characters sanitized, capped at 64 characters |
| `last4` | `••` plus the last four characters; short values are fully masked |
| `suffix6` | `…` plus at most the final six characters |

Approval titles are capped at 80 characters and descriptions at 256 characters. Missing or complex
summary values are omitted. Use `none` only for fields safe to disclose to the approval recipient.

## Development

```bash
pnpm --filter @spectratools/approval-gate typecheck
pnpm --filter @spectratools/approval-gate test
node ../../scripts/check-plugin-manifest.mjs --package .
```

## License

MIT
