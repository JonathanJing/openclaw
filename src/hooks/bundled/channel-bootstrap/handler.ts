import fs from "node:fs";
import path from "node:path";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import { isAgentBootstrapEvent, type HookHandler } from "../../hooks.js";

const log = createSubsystemLogger("channel-bootstrap");

const CHANNEL_CONTEXT_HEADING = "\n\n---\n\n## 📡 Channel-Specific Context\n\n";

/**
 * Extracts the channel or group ID from an OpenClaw session key.
 *
 * Supported patterns:
 *   Discord channel:  agent:main:discord:channel:123456
 *   Discord thread:   agent:main:discord:channel:123456:thread:789  → 123456
 *   Telegram group:   agent:main:telegram:group:-100123456789
 *   Slack channel:    agent:main:slack:channel:C0123ABCDEF
 *   WhatsApp group:   agent:main:whatsapp:group:120363403215116621@g.us
 */
export function extractChannelId(sessionKey: string): string | null {
  const discordChannel = sessionKey.match(/:discord:channel:(\d+)/);
  if (discordChannel) {
    return discordChannel[1];
  }

  const telegramGroup = sessionKey.match(/:telegram:group:(-?\d+)/);
  if (telegramGroup) {
    return telegramGroup[1];
  }

  const slackChannel = sessionKey.match(/:slack:channel:([A-Z0-9]+)/);
  if (slackChannel) {
    return slackChannel[1];
  }

  const waGroup = sessionKey.match(/:whatsapp:group:([^:]+)/);
  if (waGroup) {
    return waGroup[1];
  }

  return null;
}

const channelBootstrapHook: HookHandler = async (event) => {
  if (!isAgentBootstrapEvent(event)) {
    return;
  }

  const { workspaceDir, bootstrapFiles, sessionKey } = event.context;
  if (!workspaceDir || !bootstrapFiles) {
    return;
  }

  const channelId = extractChannelId(sessionKey ?? "");
  if (!channelId) {
    return;
  }

  const channelFile = path.join(workspaceDir, "channels", `${channelId}.md`);

  let channelContent: string;
  try {
    channelContent = fs.readFileSync(channelFile, "utf8").trim();
  } catch {
    // No channel file for this channel — silently skip
    return;
  }

  if (!channelContent) {
    return;
  }

  const agentsEntry = bootstrapFiles.find((f) => f.name === "AGENTS.md");
  if (agentsEntry) {
    agentsEntry.content = (agentsEntry.content ?? "") + CHANNEL_CONTEXT_HEADING + channelContent;
    log.debug(`appended channel context for ${channelId} to AGENTS.md`);
  } else {
    bootstrapFiles.push({
      name: "AGENTS.md",
      path: channelFile,
      content: `## 📡 Channel-Specific Context\n\n${channelContent}`,
      missing: false,
    });
    log.debug(`injected channel context for ${channelId} as new AGENTS.md entry`);
  }
};

export default channelBootstrapHook;
