import { randomUUID } from "crypto";
import { EventBus } from "../events/eventBus";
import { ExecutionEvent } from "../events/types";
import { IMAdapter, IMMessage } from "../gateway/types";
import { Logger } from "../logging";
import { ChunkThrottler } from "./chunkThrottler";
import { ExecutionRegistry, InMemoryExecutionRegistry } from "./executionRegistry";
import { Router } from "./router";

const truncate = (text: string, max: number): string => {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 3)}...`;
};

type BuiltinCommand =
  | { type: "status"; executionId: string }
  | { type: "logs"; executionId: string }
  | { type: "list" }
  | null;

export const parseBuiltinCommand = (text: string): BuiltinCommand => {
  const trimmed = text.trim();

  const statusMatch = trimmed.match(/^\/status\s+([^\s]+)\s*$/i);
  if (statusMatch?.[1]) {
    return { type: "status", executionId: statusMatch[1] };
  }

  const logsMatch = trimmed.match(/^\/logs\s+([^\s]+)\s*$/i);
  if (logsMatch?.[1]) {
    return { type: "logs", executionId: logsMatch[1] };
  }

  if (/^\/list\s*$/i.test(trimmed)) {
    return { type: "list" };
  }

  return null;
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
  private readonly executionRegistry: ExecutionRegistry;
  private readonly chunkThrottlers = new Map<string, ChunkThrottler>();
  private unsubscribeEvents?: () => void;

  constructor(
    adapters: IMAdapter[],
    private readonly router: Router,
    private readonly eventBus: EventBus,
    private readonly logger: Logger,
    executionRegistry?: ExecutionRegistry
  ) {
    this.executionRegistry = executionRegistry ?? new InMemoryExecutionRegistry();

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

    for (const throttler of this.chunkThrottlers.values()) {
      await throttler.flush();
      throttler.destroy();
    }
    this.chunkThrottlers.clear();

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

      this.trackEvent(event);

      try {
        await this.forwardEvent(adapter, event);
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

    const adapter = this.adapters.get(message.channelId);
    const builtin = parseBuiltinCommand(message.text);
    if (adapter && builtin) {
      await this.handleBuiltinCommand(adapter, message, builtin);
      return;
    }

    const executionId = randomUUID();
    const { runtime, message: routedMessage } = this.router.select(message);

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

  private trackEvent(event: ExecutionEvent): void {
    switch (event.type) {
      case "start":
        this.executionRegistry.start({
          executionId: event.executionId,
          channelId: event.channelId,
          chatId: event.chatId,
          agentName: event.payload?.agentName || "unknown",
          startedAt: event.timestamp
        });
        break;
      case "stdout":
      case "stderr": {
        const label = `[${event.type}]`;
        const text = event.payload?.text || "";
        this.executionRegistry.append(event.executionId, `${label} ${text}`);
        break;
      }
      case "complete":
        this.executionRegistry.complete(event.executionId, event.timestamp);
        break;
      case "error":
        this.executionRegistry.error(event.executionId, event.payload?.reason || "unknown", event.timestamp);
        break;
      default:
        break;
    }
  }

  private async forwardEvent(adapter: IMAdapter, event: ExecutionEvent): Promise<void> {
    if (event.type === "stdout" || event.type === "stderr") {
      const throttler = this.getChunkThrottler(event.channelId, event.chatId, adapter);
      const text = `${event.type === "stdout" ? "[stdout]" : "[stderr]"} ${event.payload?.text || ""}`;
      throttler.push(text);
      return;
    }

    if (event.type === "complete" || event.type === "error") {
      await this.flushAndDeleteThrottler(event.channelId, event.chatId);
    }

    await adapter.sendMessage(event.chatId, formatEvent(event));
  }

  private getChunkThrottler(channelId: string, chatId: string, adapter: IMAdapter): ChunkThrottler {
    const key = `${channelId}:${chatId}`;
    const existing = this.chunkThrottlers.get(key);
    if (existing) {
      return existing;
    }

    const throttler = new ChunkThrottler({
      flushIntervalMs: 1_000,
      maxChunkLength: 3_500,
      send: async (text) => {
        await adapter.sendMessage(chatId, text);
      }
    });

    this.chunkThrottlers.set(key, throttler);
    return throttler;
  }

  private async flushAndDeleteThrottler(channelId: string, chatId: string): Promise<void> {
    const key = `${channelId}:${chatId}`;
    const throttler = this.chunkThrottlers.get(key);
    if (!throttler) {
      return;
    }

    await throttler.flush();
    throttler.destroy();
    this.chunkThrottlers.delete(key);
  }

  private async handleBuiltinCommand(
    adapter: IMAdapter,
    message: IMMessage,
    command: Exclude<BuiltinCommand, null>
  ): Promise<void> {
    if (command.type === "list") {
      const records = this.executionRegistry.list(message.channelId, message.chatId).slice(0, 10);
      if (records.length === 0) {
        await adapter.sendMessage(message.chatId, "Recent executions (this chat):\n• (none)");
        return;
      }

      const lines = records.map((record) => {
        const icon = record.status === "complete" ? "✅" : record.status === "error" ? "❌" : "⏳";
        const statusLabel = record.status === "complete" ? "Complete" : record.status === "error" ? "Error" : "Running";
        const isoTime = new Date(record.startedAt).toISOString().slice(11, 19);
        return `• ${record.executionId} ${icon} ${statusLabel} ${isoTime}Z`;
      });

      await adapter.sendMessage(message.chatId, `Recent executions (this chat):\n${lines.join("\n")}`);
      return;
    }

    const record = this.executionRegistry.get(command.executionId);
    if (!record || record.channelId !== message.channelId || record.chatId !== message.chatId) {
      await adapter.sendMessage(message.chatId, `Unknown execution ID: ${command.executionId}`);
      return;
    }

    if (command.type === "status") {
      const endTime = record.finishedAt ?? Date.now();
      const duration = Math.max(0, Math.floor((endTime - record.startedAt) / 1_000));
      const firstLine = record.status === "running"
        ? `⏳ Running (${duration}s) · ${record.executionId}`
        : record.status === "complete"
          ? `✅ Complete (${duration}s) · ${record.executionId}`
          : `❌ Error (${duration}s) · ${record.executionId}`;

      if (record.status === "running") {
        const lastLine = record.outputLines[record.outputLines.length - 1];
        const lastOutput = lastLine ? `Last output: ${lastLine}` : "Last output: (none)";
        await adapter.sendMessage(message.chatId, `${firstLine}\n${lastOutput}`);
        return;
      }

      if (record.status === "complete") {
        await adapter.sendMessage(
          message.chatId,
          `${firstLine}\nFinished: ${new Date(record.finishedAt || Date.now()).toISOString()}`
        );
        return;
      }

      await adapter.sendMessage(message.chatId, `${firstLine}\nReason: ${record.errorReason || "unknown"}`);
      return;
    }

    const lines = record.outputLines;
    await adapter.sendMessage(
      message.chatId,
      lines.length > 0 ? lines.join("\n") : "No output captured for this execution yet."
    );
  }
}
