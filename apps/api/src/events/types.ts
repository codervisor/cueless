export type ExecutionEventType = "start" | "stdout" | "stderr" | "complete" | "error";

export interface ExecutionEvent {
  executionId: string;
  chatId: string;
  type: ExecutionEventType;
  timestamp: number;
  payload?: {
    text?: string;
    code?: number | null;
    reason?: string;
  };
}
