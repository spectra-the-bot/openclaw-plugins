import type { IncomingMessage, ServerResponse } from "node:http";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { createNativeSchedulerTool } from "./src/tool.js";

export default function register(api: OpenClawPluginApi) {
  api.registerTool(createNativeSchedulerTool(api) as AnyAgentTool, { optional: true });

  // Register HTTP route for zero-token message delivery from the wrapper.
  // The wrapper POSTs { text, channel, target } here when a script emits
  // { result: "message" }. This path avoids triggering an LLM turn.
  api.registerHttpRoute({
    path: "/native-scheduler/deliver",
    auth: "plugin",
    match: "exact",
    async handler(req: IncomingMessage, res: ServerResponse) {
      if (req.method !== "POST") {
        res.writeHead(405);
        res.end(JSON.stringify({ error: "method not allowed" }));
        return;
      }

      try {
        const body = await readBody(req);
        const { text, channel, target } = JSON.parse(body) as {
          text?: string;
          channel?: string;
          target?: string;
        };

        if (!text || !channel) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "text and channel are required" }));
          return;
        }

        // Use the runtime's channel-specific send functions for zero-token delivery.
        const runtime = api.runtime;

        if (channel === "discord" && runtime.channel?.discord?.sendMessageDiscord) {
          await runtime.channel.discord.sendMessageDiscord(target ?? "", text);
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
        } else if (channel === "telegram" && runtime.channel?.telegram?.sendMessageTelegram) {
          await runtime.channel.telegram.sendMessageTelegram(target ?? "", text);
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
        } else {
          // Fallback: channel not available or not supported
          res.writeHead(501);
          res.end(
            JSON.stringify({
              error: `channel "${channel}" delivery not implemented — use prompt result instead`,
            }),
          );
        }
      } catch (error) {
        res.writeHead(500);
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    },
  });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer | string) => {
      data += String(chunk);
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
