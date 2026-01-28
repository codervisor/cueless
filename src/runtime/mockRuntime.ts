import { EventBus } from "../events/eventBus";
import { IMMessage } from "../gateway/types";
import { Runtime } from "./types";

export class MockRuntime implements Runtime {
  async execute(message: IMMessage, executionId: string, eventBus: EventBus): Promise<void> {
    eventBus.emit({
      executionId,
      chatId: message.chatId,
      type: "start",
      timestamp: Date.now()
    });

    eventBus.emit({
      executionId,
      chatId: message.chatId,
      type: "stdout",
      timestamp: Date.now(),
      payload: { text: `Mock runtime received: ${message.text}` }
    });

    eventBus.emit({
      executionId,
      chatId: message.chatId,
      type: "complete",
      timestamp: Date.now()
    });
  }
}
