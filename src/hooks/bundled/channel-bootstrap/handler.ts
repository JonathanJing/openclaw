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
 *   Slack channel:    agent:main:slack:channel:c0123abcdef (lowercased by session-key.ts)
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

  // Case-insensitive: session-key.ts lowercases peerId, so Slack IDs may be lowercase at runtime
  const slackChannel = sessionKey.match(/:slack:channel:([A-Z0-9]+)/i);
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

  // Find an existing, non-missing AGENTS.md entry to append to.
  // We must not mutate the cached entry in place (bootstrap-cache.ts reuses the same
  // array across agent:bootstrap calls within a session), so we replace the entry with
  // a shallow clone that carries the updated content.
  const agentsIndex = bootstrapFiles.findIndex((f) => f.name === "AGENTS.md" && !f.missing);
  if (agentsIndex !== -1) {
    const original = bootstrapFiles[agentsIndex];
    bootstrapFiles[agentsIndex] = {
      ...original,
      content: (original.content ?? "") + CHANNEL_CONTEXT_HEADING + channelContent,
    };
    log.debug(`appended channel context for ${channelId} to AGENTS.md`);
  } else {
    // Either AGENTS.md is absent or marked missing — inject as a new, non-missing entry.
    // Use the workspace AGENTS.md path (not the channel file) so the system-prompt heading
    // renders correctly (src/agents/system-prompt.ts reads path as the section heading).
    bootstrapFiles.push({
      name: "AGENTS.md",
      path: path.join(workspaceDir, "AGENTS.md"),
      content: `## 📡 Channel-Specific Context\n\n${channelContent}`,
      missing: false,
    });
    log.debug(`injected channel context for ${channelId} as new AGENTS.md entry`);
  }
};

export default channelBootstrapHook;
