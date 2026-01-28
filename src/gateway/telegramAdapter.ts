import TelegramBot, { Message } from "node-telegram-bot-api";
import { IMAdapter, IMMessage } from "./types";
import { Logger } from "../logging";

export class TelegramAdapter implements IMAdapter {
  private bot?: TelegramBot;

  constructor(private readonly token: string, private readonly logger: Logger) { }

  async start(onMessage: (message: IMMessage) => void): Promise<void> {
    this.bot = new TelegramBot(this.token, { polling: true });
    this.bot.on("message", (message: Message) => {
      if (!message.text || !message.chat?.id) {
        return;
      }

      const payload: IMMessage = {
        chatId: String(message.chat.id),
        userId: message.from ? String(message.from.id) : undefined,
        text: message.text,
        raw: message
      };

      this.logger.debug("Telegram message received.", { chatId: payload.chatId });
      onMessage(payload);
    });

    this.logger.info("Telegram adapter started.");
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    if (!this.bot) {
      throw new Error("Telegram bot not started.");
    }
    await this.bot.sendMessage(Number(chatId), text);
  }

  async stop(): Promise<void> {
    if (!this.bot) {
      return;
    }
    await this.bot.stopPolling();
    this.logger.info("Telegram adapter stopped.");
  }
}
