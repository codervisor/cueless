import { EventBus } from "../events/eventBus";
import { IMMessage } from "../gateway/types";

export interface Runtime {
  execute: (message: IMMessage, executionId: string, eventBus: EventBus) => Promise<void>;
}
