import { AgentConfig } from "../../config";
import { EventBus } from "../../events/eventBus";
import { IMMessage } from "../../gateway/types";
import { Logger } from "../../logging";
import { MemoryStore } from "../../memory";
import { MemoryExtractor } from "../../memory/extractor";
import { MemorySync } from "../../memory/sync";
import { Runtime } from "../types";
import { FileSessionStore } from "./fileSessionStore";
import { SessionManager } from "./types";

export interface SessionRuntimeOptions {
  fileStore?: FileSessionStore;
  memoryStore?: MemoryStore;
  memorySync?: MemorySync;
  memoryExtractor?: MemoryExtractor;
}

export class SessionRuntime implements Runtime {
  private readonly fileStore?: FileSessionStore;
  private readonly memoryStore?: MemoryStore;
  private readonly memorySync?: MemorySync;
  private readonly memoryExtractor?: MemoryExtractor;

  constructor(
    private readonly config: AgentConfig,
    private readonly sessionManager: SessionManager,
    private readonly logger: Logger,
    fileStoreOrOptions?: FileSessionStore | SessionRuntimeOptions,
    memoryStore?: MemoryStore
  ) {
    // Support both old signature (fileStore, memoryStore) and new options object
    if (fileStoreOrOptions && "get" in fileStoreOrOptions) {
      this.fileStore = fileStoreOrOptions;
      this.memoryStore = memoryStore;
    } else if (fileStoreOrOptions) {
      const opts = fileStoreOrOptions as SessionRuntimeOptions;
      this.fileStore = opts.fileStore;
      this.memoryStore = opts.memoryStore;
      this.memorySync = opts.memorySync;
      this.memoryExtractor = opts.memoryExtractor;
    }
  }

  async execute(message: IMMessage, executionId: string, eventBus: EventBus): Promise<void> {
    const session = this.sessionManager.getOrCreate(
      message.channelId,
      message.chatId,
      this.config.name
    );

    eventBus.emit({
      executionId,
      channelId: message.channelId,
      chatId: message.chatId,
      type: "start",
      timestamp: Date.now(),
      payload: { agentName: this.config.name }
    });

    const response = await session.send(message.text, executionId, eventBus);

    // Persist the session resume ID so conversations survive restarts
    if (session.resumeId && this.fileStore) {
      const storeKey = `${message.channelId}::${message.chatId}::${this.config.name}`;
      this.fileStore.set(storeKey, session.resumeId);
    }

    if (!response) {
      this.logger.warn("Session returned empty response — runtime may have failed silently.", {
        executionId,
        sessionId: session.sessionId,
        channelId: message.channelId,
        chatId: message.chatId,
        runtime: this.config.runtime
      });
    }

    eventBus.emit({
      executionId,
      channelId: message.channelId,
      chatId: message.chatId,
      type: "complete",
      timestamp: Date.now(),
      payload: { response }
    });

    // Extract memories async — don't block the next user message
    if (response && this.memoryExtractor && this.memoryStore && this.memorySync) {
      void this.extractAndSyncMemory(message.text, response).catch((err) => {
        this.logger.warn("Memory extraction failed.", {
          reason: err instanceof Error ? err.message : "unknown",
        });
      });
    }

    this.logger.debug("Session runtime execution completed.", {
      executionId,
      sessionId: session.sessionId,
      channelId: message.channelId,
      chatId: message.chatId,
      runtime: this.config.runtime
    });
  }

  private async extractAndSyncMemory(userText: string, response: string): Promise<void> {
    const conversation = `User: ${userText}\n\nAssistant: ${response}`;
    const changes = await this.memoryExtractor!.extract(conversation, this.memoryStore!.all());

    const hasChanges = changes.add.length > 0 || changes.update.length > 0 || changes.remove.length > 0;
    if (!hasChanges) return;

    const changelogParts: string[] = [];

    for (const item of changes.add) {
      const fact = this.memoryStore!.add(item.tag, item.text);
      changelogParts.push(`➕ <code>${fact.id}</code> [${fact.tag}] ${fact.text}`);
    }

    for (const item of changes.update) {
      if (this.memoryStore!.update(item.id, item.text)) {
        changelogParts.push(`✏️ <code>${item.id}</code> → ${item.text}`);
      }
    }

    for (const id of changes.remove) {
      const fact = this.memoryStore!.get(id);
      if (fact && this.memoryStore!.remove(id)) {
        changelogParts.push(`🗑️ <code>${id}</code> ${fact.text}`);
      }
    }

    // Sync to Telegram
    await this.memorySync!.save(this.memoryStore!.snapshot());

    if (changelogParts.length > 0) {
      await this.memorySync!.sendChangelog(
        `<b>🧠 Memory updated</b>\n\n${changelogParts.join("\n")}`
      );
    }

    this.logger.info("Memory updated.", {
      added: changes.add.length,
      updated: changes.update.length,
      removed: changes.remove.length,
    });
  }
}
