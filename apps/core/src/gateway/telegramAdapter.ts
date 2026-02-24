import TelegramBot, { Message } from "node-telegram-bot-api";
import { IMAdapter, IMMessage } from "./types";
import { Logger } from "../logging";

export class TelegramAdapter implements IMAdapter {
  private bot?: TelegramBot;

  constructor(
    public readonly id: string,
    private readonly token: string,
    private readonly pollingInterval: number,
    private readonly logger: Logger
  ) { }

  async start(onMessage: (message: IMMessage) => void): Promise<void> {
    // Create the bot without auto-starting polling so we can delete any stale
    // getUpdates session first, preventing 409 conflicts.
    this.bot = new TelegramBot(this.token, { polling: false });
    await this.bot.startPolling({ restart: false, interval: this.pollingInterval } as TelegramBot.StartPollingOptions);

    this.bot.on("message", (message: Message) => {
      if (!message.text || !message.chat?.id) {
        return;
      }

      const payload: IMMessage = {
        channelId: this.id,
        chatId: String(message.chat.id),
        userId: message.from ? String(message.from.id) : undefined,
        text: message.text,
        raw: message
      };

      this.logger.debug("Telegram message received.", { channelId: this.id, chatId: payload.chatId });
      onMessage(payload);
    });

    this.bot.on("polling_error", (error) => {
      this.logger.warn("Telegram polling error.", { channelId: this.id, code: (error as NodeJS.ErrnoException).code, message: error.message });
    });

    this.logger.info("Telegram adapter started.", { channelId: this.id });
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
    this.logger.info("Telegram adapter stopped.", { channelId: this.id });
  }
}
