export interface IMMessage {
  channelId: string;
  chatId: string;
  userId?: string;
  text: string;
  raw?: unknown;
}

export interface IMAdapter {
  id: string;
  start: (onMessage: (message: IMMessage) => void) => Promise<void>;
  sendMessage: (chatId: string, text: string) => Promise<void>;
  stop: () => Promise<void>;
}
