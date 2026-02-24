import { randomUUID } from "crypto";
import { EventBus } from "../events/eventBus";
import { ExecutionEvent } from "../events/types";
import { Logger } from "../logging";
import { IMAdapter, IMMessage } from "./types";
import { Runtime } from "../runtime/types";

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
      return "Execution complete.";
    case "error":
      return `Execution error: ${event.payload?.reason || "unknown"}`;
    default:
      return "Execution update.";
  }
};

export class Gateway {
  constructor(
    private readonly adapter: IMAdapter,
    private readonly runtime: Runtime,
    private readonly eventBus: EventBus,
    private readonly logger: Logger
  ) { }

  async start(): Promise<void> {
    await this.adapter.start((message) => void this.handleMessage({
      ...message,
      channelId: this.adapter.id
    }));
    this.logger.info("Gateway started.");
  }

  async stop(): Promise<void> {
    await this.adapter.stop();
    this.logger.info("Gateway stopped.");
  }

  private async handleMessage(message: IMMessage): Promise<void> {
    if (!message.text || message.text.trim().length === 0) {
      this.logger.warn("Ignoring empty message.", { chatId: message.chatId });
      return;
    }

    const executionId = randomUUID();
    const chatId = message.chatId;
    const channelId = message.channelId;

    this.logger.info("Received message.", { executionId, channelId, chatId });
    await this.adapter.sendMessage(chatId, `Received command. Execution ID: ${executionId}`);

    const unsubscribe = this.eventBus.on(async (event) => {
      if (
        event.executionId !== executionId
        || event.channelId !== channelId
        || event.chatId !== chatId
      ) {
        return;
      }
      const text = formatEvent(event);
      await this.adapter.sendMessage(chatId, text);
    });

    try {
      await this.runtime.execute(message, executionId, this.eventBus);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown";
      this.eventBus.emit({
        executionId,
        channelId,
        chatId,
        type: "error",
        timestamp: Date.now(),
        payload: { reason }
      });
      this.logger.error("Runtime execution failed.", { executionId, reason });
    } finally {
      unsubscribe();
    }
  }
}
