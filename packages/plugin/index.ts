import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { createNativeSchedulerTool } from "./src/tool.js";

export default function register(api: OpenClawPluginApi) {
  api.registerTool(createNativeSchedulerTool(api) as AnyAgentTool, { optional: true });
}
