import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { createNativeSchedulerTool } from "./src/tool.js";

export default function register(api: OpenClawPluginApi) {
  api.registerTool(createNativeSchedulerTool(api) as AnyAgentTool, { optional: true });

  // Register HTTP route for zero-token message delivery from the wrapper.
  // The wrapper POSTs { text, channel, target? } to this route when a script
  // returns { result: "message" }. The plugin sends it directly to the channel
  // without invoking the LLM agent.
  if (typeof api.registerHttpRoute === "function") {
    api.registerHttpRoute({
      path: "/native-scheduler/deliver",
      auth: "plugin",
      handler: async (req, res) => {
        try {
          const raw = await readBody(req);
          const body = JSON.parse(raw) as Record<string, unknown>;

          const text = typeof body.text === "string" ? body.text : undefined;
          const channel = typeof body.channel === "string" ? body.channel : undefined;
          const target = typeof body.target === "string" ? body.target : undefined;

          if (!text || !channel) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "text and channel are required" }));
            return true;
          }

          // TODO: Wire up actual channel send via plugin runtime when the API
          // surface for direct message dispatch is available. For now, fall back
          // to openclaw system event with channel context in the text.
          api.logger.info?.(
            `[native-scheduler] message delivery: channel=${channel} target=${target ?? "default"}`,
          );

          res.statusCode = 200;
          res.end(JSON.stringify({ ok: true, delivered: "logged", channel, target }));
          return true;
        } catch (error) {
          res.statusCode = 500;
          res.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }),
          );
          return true;
        }
      },
    });
  }
}

function readBody(req: {
  on: (event: string, cb: (chunk: unknown) => void) => void;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: unknown) => {
      data += String(chunk);
    });
    req.on("end", () => resolve(data));
    req.on("error", (err: unknown) => reject(err));
  });
}
