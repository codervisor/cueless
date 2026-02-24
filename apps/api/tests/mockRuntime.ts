import { EventBus } from "../src/events/eventBus";
import { IMMessage } from "../src/gateway/types";
import { Runtime } from "../src/runtime/types";

export class MockRuntime implements Runtime {
  async execute(message: IMMessage, executionId: string, eventBus: EventBus): Promise<void> {
    eventBus.emit({
      executionId,
      channelId: message.channelId,
      chatId: message.chatId,
      type: "start",
      timestamp: Date.now()
    });

    eventBus.emit({
      executionId,
      channelId: message.channelId,
      chatId: message.chatId,
      type: "stdout",
      timestamp: Date.now(),
      payload: { text: `Mock runtime received: ${message.text}` }
    });

    eventBus.emit({
      executionId,
      channelId: message.channelId,
      chatId: message.chatId,
      type: "complete",
      timestamp: Date.now()
    });
  }
}
