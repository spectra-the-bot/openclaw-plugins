import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/core";

const NativeSchedulerToolSchema = Type.Object({
  action: Type.Union([Type.Literal("status"), Type.Literal("platforms"), Type.Literal("plan")]),
  schedule: Type.Optional(
    Type.String({ description: "Optional schedule expression to inspect or validate." }),
  ),
  command: Type.Optional(
    Type.String({ description: "Optional command you expect the native scheduler to run." }),
  ),
});

type NativeSchedulerToolParams = {
  action: "status" | "platforms" | "plan";
  schedule?: string;
  command?: string;
};

function detectBackend() {
  switch (process.platform) {
    case "darwin":
      return "launchd";
    case "win32":
      return "windows-task-scheduler";
    case "linux":
      return "systemd-or-cron";
    default:
      return "unknown";
  }
}

function renderText(params: NativeSchedulerToolParams) {
  if (params.action === "platforms") {
    return [
      "Supported native scheduler targets:",
      "- macOS: launchd",
      "- Linux: systemd timers or cron",
      "- Windows: Task Scheduler",
    ].join("\n");
  }

  if (params.action === "plan") {
    return [
      "Native scheduler plugin scaffold is installed, but job management is not implemented yet.",
      `Detected platform backend: ${detectBackend()}.`,
      params.schedule ? `Requested schedule: ${params.schedule}` : "No schedule supplied.",
      params.command ? `Requested command: ${params.command}` : "No command supplied.",
    ].join("\n");
  }

  return [
    "Native scheduler plugin scaffold is installed.",
    `Detected platform backend: ${detectBackend()}.`,
    "Current scaffold exposes a placeholder planning/status tool only.",
    "Next step: implement create/list/update/remove/run-now adapters per platform.",
  ].join("\n");
}

export function createNativeSchedulerTool(_api: OpenClawPluginApi): AnyAgentTool {
  return {
    name: "native_scheduler",
    description:
      "Inspect the native OS scheduler backend and plan future scheduler operations. Scaffold tool for a cross-platform scheduler plugin.",
    parameters: NativeSchedulerToolSchema,
    async execute(_id, params: NativeSchedulerToolParams) {
      return {
        content: [
          {
            type: "text",
            text: renderText(params),
          },
        ],
      };
    },
  } as AnyAgentTool;
}
