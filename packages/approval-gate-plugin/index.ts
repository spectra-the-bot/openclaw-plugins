import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { evaluateToolCall, resolveConfig } from "./policy.js";

export const PLUGIN_ID = "approval-gate";
export * from "./policy.js";

export default definePluginEntry({
  id: PLUGIN_ID,
  name: "Approval Gate",
  description: "Declarative critical approval gates for exact OpenClaw tool and agent matches.",
  register(api) {
    const config = resolveConfig(api.pluginConfig);

    api.on(
      "before_tool_call",
      (event, ctx) => {
        const decision = evaluateToolCall({
          toolName: event.toolName,
          agentId: ctx.agentId,
          params: event.params ?? {},
          config,
        });

        switch (decision.kind) {
          case "bypass":
            return;
          case "block":
            return { block: true, blockReason: decision.reason };
          case "approve":
            return {
              requireApproval: {
                ...decision.approval,
                allowedDecisions: [...decision.approval.allowedDecisions],
              },
            };
        }
      },
      { priority: 100 },
    );
  },
});
