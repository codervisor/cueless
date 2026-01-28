export interface IMMessage {
  chatId: string;
  userId?: string;
  text: string;
  raw?: unknown;
}

export interface IMAdapter {
  start: (onMessage: (message: IMMessage) => void) => Promise<void>;
  sendMessage: (chatId: string, text: string) => Promise<void>;
  stop: () => Promise<void>;
}
