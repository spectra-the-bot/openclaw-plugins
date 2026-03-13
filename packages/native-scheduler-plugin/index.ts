import type { IncomingMessage, ServerResponse } from "node:http";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { createNativeSchedulerTool } from "./src/tool.js";

export default function register(api: OpenClawPluginApi) {
  api.registerTool(createNativeSchedulerTool(api) as AnyAgentTool, { optional: true });

  // Register HTTP route for zero-token message delivery from the wrapper.
  // The wrapper POSTs { text, channel, target } here when a script emits
  // { result: "message" }. This path bypasses the LLM entirely — no agent turn,
  // no tokens.
  api.registerHttpRoute({
    path: "/native-scheduler/deliver",
    auth: "plugin",
    match: "exact",
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== "POST") {
        res.writeHead(405);
        res.end(JSON.stringify({ error: "method not allowed" }));
        return;
      }

      try {
        const { text, channel, target } = JSON.parse(await readBody(req)) as {
          text?: string;
          channel?: string;
          target?: string;
        };

        if (!text || !channel) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "text and channel are required" }));
          return;
        }

        if (!target) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "target is required for message delivery" }));
          return;
        }

        const cfg = api.config;
        const ch = api.runtime.channel;

        // Validate channel-specific target formats before attempting delivery.
        if (channel === "discord" && !target.startsWith("channel:") && !target.startsWith("user:")) {
          res.writeHead(400);
          res.end(
            JSON.stringify({
              error:
                `Invalid Discord target "${target}". ` +
                `Use "channel:<id>" for channel messages (e.g. "channel:1234567890") ` +
                `or "user:<id>" for DMs (e.g. "user:1234567890").`,
            }),
          );
          return;
        }

        switch (channel) {
          case "discord":
            await ch.discord.sendMessageDiscord(target, text, { cfg });
            break;
          case "telegram":
            await ch.telegram.sendMessageTelegram(target, text, { cfg });
            break;
          case "slack":
            await ch.slack.sendMessageSlack(target, text, { cfg });
            break;
          case "signal":
            await ch.signal.sendMessageSignal(target, text, { cfg });
            break;
          case "imessage":
            await ch.imessage.sendMessageIMessage(target, text);
            break;
          case "whatsapp":
            await ch.whatsapp.sendMessageWhatsApp(target, text, { verbose: false, cfg });
            break;
          case "line":
            await ch.line.sendMessageLine(target, text, { cfg });
            break;
          default:
            res.writeHead(501);
            res.end(
              JSON.stringify({
                error: `channel "${channel}" is not supported — supported: discord, telegram, slack, signal, imessage, whatsapp, line`,
              }),
            );
            return;
        }

        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, channel, target }));
      } catch (error) {
        api.logger.error?.(
          `[native-scheduler] message delivery error: ${error instanceof Error ? error.message : String(error)}`,
        );
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
