import EventEmitter from "eventemitter3";
import { ExecutionEvent } from "./types";

export type EventListener = (event: ExecutionEvent) => void;

export class EventBus {
  private readonly emitter = new EventEmitter();

  emit(event: ExecutionEvent): void {
    this.emitter.emit("event", event);
  }

  on(listener: EventListener): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }
}
