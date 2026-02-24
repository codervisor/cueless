export interface ChunkThrottlerOptions {
  flushIntervalMs?: number;
  maxChunkLength?: number;
  send: (text: string) => Promise<void>;
}

const DEFAULT_FLUSH_INTERVAL_MS = 1_000;
const DEFAULT_MAX_CHUNK_LENGTH = 3_500;

export class ChunkThrottler {
  private readonly flushIntervalMs: number;
  private readonly maxChunkLength: number;
  private readonly send: (text: string) => Promise<void>;
  private timer?: NodeJS.Timeout;
  private buffer = "";
  private queue: Promise<void> = Promise.resolve();

  constructor(options: ChunkThrottlerOptions) {
    this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.maxChunkLength = options.maxChunkLength ?? DEFAULT_MAX_CHUNK_LENGTH;
    this.send = options.send;
  }

  push(text: string): void {
    if (text.length === 0) {
      return;
    }

    this.buffer += text;
    if (!this.timer) {
      this.timer = setTimeout(() => {
        void this.flush();
      }, this.flushIntervalMs);
    }
  }

  flush(): Promise<void> {
    const content = this.buffer;
    this.buffer = "";

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    if (content.length === 0) {
      return this.queue;
    }

    this.queue = this.queue.then(async () => {
      for (let i = 0; i < content.length; i += this.maxChunkLength) {
        await this.send(content.slice(i, i + this.maxChunkLength));
      }
    });

    return this.queue;
  }

  destroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.buffer = "";
  }
}
