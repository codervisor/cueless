export type ExecutionEventType = "start" | "stdout" | "stderr" | "complete" | "error";

export interface ExecutionEvent {
  executionId: string;
  channelId: string;
  chatId: string;
  type: ExecutionEventType;
  timestamp: number;
  payload?: {
    text?: string;
    code?: number | null;
    reason?: string;
    response?: string;
  };
}
