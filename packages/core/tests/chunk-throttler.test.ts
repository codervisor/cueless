import assert from "assert";
import test from "node:test";
import { ChunkThrottler } from "../src/hub/chunkThrottler";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("ChunkThrottler coalesces chunks within flush interval", async () => {
  const sent: string[] = [];
  const throttler = new ChunkThrottler({
    flushIntervalMs: 20,
    maxChunkLength: 3_500,
    send: async (text) => {
      sent.push(text);
    }
  });

  throttler.push("one ");
  throttler.push("two");

  await sleep(40);

  assert.deepEqual(sent, ["one two"]);
  throttler.destroy();
});

test("ChunkThrottler flush forces send and respects max chunk length", async () => {
  const sent: string[] = [];
  const throttler = new ChunkThrottler({
    flushIntervalMs: 1_000,
    maxChunkLength: 4,
    send: async (text) => {
      sent.push(text);
    }
  });

  throttler.push("abcdefgh");
  await throttler.flush();

  assert.deepEqual(sent, ["abcd", "efgh"]);
  throttler.destroy();
});
