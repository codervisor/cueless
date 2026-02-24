import { AgentConfig } from "../../config";
import { EventBus } from "../../events/eventBus";
import { IMMessage } from "../../gateway/types";
import { Logger } from "../../logging";
import { Runtime } from "../types";
import { SessionManager } from "./types";

export class SessionRuntime implements Runtime {
  constructor(
    private readonly config: AgentConfig,
    private readonly sessionManager: SessionManager,
    private readonly logger: Logger
  ) { }

  async execute(message: IMMessage, executionId: string, eventBus: EventBus): Promise<void> {
    const session = this.sessionManager.getOrCreate(
      message.channelId,
      message.chatId,
      this.config.name
    );

    const response = await session.send(message.text, executionId, eventBus);

    eventBus.emit({
      executionId,
      channelId: message.channelId,
      chatId: message.chatId,
      type: "complete",
      timestamp: Date.now(),
      payload: { response }
    });

    this.logger.debug("Session runtime execution completed.", {
      executionId,
      sessionId: session.sessionId,
      channelId: message.channelId,
      chatId: message.chatId,
      runtime: this.config.runtime
    });
  }
}