import { IMAdapter, IMMessage } from "./types";

export class MockAdapter implements IMAdapter {
  private handler?: (message: IMMessage) => void;
  public sentMessages: Array<{ chatId: string; text: string }> = [];

  async start(onMessage: (message: IMMessage) => void): Promise<void> {
    this.handler = onMessage;
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    this.sentMessages.push({ chatId, text });
  }

  async stop(): Promise<void> {
    this.handler = undefined;
  }

  async simulateIncoming(message: IMMessage): Promise<void> {
    if (!this.handler) {
      throw new Error("Mock adapter not started.");
    }
    this.handler(message);
  }
}
