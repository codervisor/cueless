import { ChannelConfig } from "../config";
import { IMMessage } from "../gateway/types";
import { Runtime } from "../runtime/types";
import { AgentRegistry } from "./agentRegistry";

export interface Router {
  select(message: IMMessage): { runtime: Runtime; message: IMMessage };
}

const PREFIX_PATTERN = /^@([a-zA-Z0-9_-]+)\s+(.*)$/s;

export class DefaultRouter implements Router {
  private readonly channelDefaults = new Map<string, string>();

  constructor(
    channels: ChannelConfig[],
    private readonly registry: AgentRegistry
  ) {
    for (const channel of channels) {
      if (channel.defaultAgent) {
        this.channelDefaults.set(channel.id, channel.defaultAgent);
      }
    }
  }

  select(message: IMMessage): { runtime: Runtime; message: IMMessage } {
    const prefixMatch = message.text.match(PREFIX_PATTERN);
    if (prefixMatch) {
      const [, agentName, strippedText] = prefixMatch;
      const runtime = this.registry.get(agentName);
      if (runtime) {
        return {
          runtime,
          message: {
            ...message,
            text: strippedText.trim()
          }
        };
      }
    }

    const channelDefaultName = this.channelDefaults.get(message.channelId);
    if (channelDefaultName) {
      const runtime = this.registry.get(channelDefaultName);
      if (runtime) {
        return { runtime, message };
      }
    }

    return {
      runtime: this.registry.default(),
      message
    };
  }
}
