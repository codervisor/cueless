import { randomUUID } from "crypto";
import { EventBus } from "../events/eventBus";
import { ExecutionEvent } from "../events/types";
import { IMAdapter, IMMessage } from "../gateway/types";
import { Logger } from "../logging";
import { Router } from "./router";

const truncate = (text: string, max: number): string => {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 3)}...`;
};

const formatEvent = (event: ExecutionEvent): string => {
  switch (event.type) {
    case "start":
      return "Started execution.";
    case "stdout":
      return `STDOUT: ${truncate(event.payload?.text || "", 3500)}`;
    case "stderr":
      return `STDERR: ${truncate(event.payload?.text || "", 3500)}`;
    case "complete":
      return event.payload?.response || "Execution complete.";
    case "error":
      return `Execution error: ${event.payload?.reason || "unknown"}`;
    default:
      return "Execution update.";
  }
};

export class ChannelHub {
  private readonly adapters = new Map<string, IMAdapter>();
  private unsubscribeEvents?: () => void;

  constructor(
    adapters: IMAdapter[],
    private readonly router: Router,
    private readonly eventBus: EventBus,
    private readonly logger: Logger
  ) {
    for (const adapter of adapters) {
      if (this.adapters.has(adapter.id)) {
        throw new Error(`Duplicate channel id '${adapter.id}' in channel configuration.`);
      }
      this.adapters.set(adapter.id, adapter);
    }
  }

  async start(): Promise<void> {
    this.subscribeEvents();
    await Promise.all(Array.from(this.adapters.values()).map((adapter) => {
      return adapter.start((message) => void this.handleMessage({
        ...message,
        channelId: adapter.id
      }));
    }));

    this.logger.info("ChannelHub started.", { channels: Array.from(this.adapters.keys()) });
  }

  async stop(): Promise<void> {
    if (this.unsubscribeEvents) {
      this.unsubscribeEvents();
      this.unsubscribeEvents = undefined;
    }

    await Promise.all(Array.from(this.adapters.values()).map((adapter) => adapter.stop()));
    this.logger.info("ChannelHub stopped.");
  }

  private subscribeEvents(): void {
    if (this.unsubscribeEvents) {
      return;
    }

    this.unsubscribeEvents = this.eventBus.on(async (event) => {
      const adapter = this.adapters.get(event.channelId);
      if (!adapter) {
        this.logger.warn("No adapter found for execution event.", {
          channelId: event.channelId,
          executionId: event.executionId
        });
        return;
      }

      try {
        await adapter.sendMessage(event.chatId, formatEvent(event));
      } catch (error) {
        this.logger.error("Failed to dispatch execution event.", {
          channelId: event.channelId,
          executionId: event.executionId,
          reason: error instanceof Error ? error.message : "unknown"
        });
      }
    });
  }

  private async handleMessage(message: IMMessage): Promise<void> {
    if (!message.text || message.text.trim().length === 0) {
      this.logger.warn("Ignoring empty message.", {
        channelId: message.channelId,
        chatId: message.chatId
      });
      return;
    }

    const executionId = randomUUID();
    const { runtime, message: routedMessage } = this.router.select(message);

    const adapter = this.adapters.get(message.channelId);
    if (adapter) {
      await adapter.sendMessage(message.chatId, `Received command. Execution ID: ${executionId}`);
    }

    this.logger.info("Received message.", {
      executionId,
      channelId: message.channelId,
      chatId: message.chatId
    });

    try {
      await runtime.execute(routedMessage, executionId, this.eventBus);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown";
      this.eventBus.emit({
        executionId,
        channelId: message.channelId,
        chatId: message.chatId,
        type: "error",
        timestamp: Date.now(),
        payload: { reason }
      });
      this.logger.error("Runtime execution failed.", { executionId, reason });
    }
  }
}
