import assert from "assert";
import test from "node:test";
import { InMemoryExecutionRegistry } from "../src/hub/executionRegistry";

test("ExecutionRegistry stores lifecycle and returns newest-first list", () => {
  const registry = new InMemoryExecutionRegistry({
    now: () => 0
  });

  registry.start({
    executionId: "a",
    channelId: "telegram",
    chatId: "chat-1",
    agentName: "claude",
    startedAt: 1
  });

  registry.start({
    executionId: "b",
    channelId: "telegram",
    chatId: "chat-1",
    agentName: "gemini",
    startedAt: 2
  });

  registry.append("a", "[stdout] first\n[stderr] second");
  registry.complete("a", 10);

  const first = registry.get("a");
  assert.equal(first?.status, "complete");
  assert.deepEqual(first?.outputLines, ["[stdout] first", "[stderr] second"]);

  const listed = registry.list("telegram", "chat-1");
  assert.deepEqual(listed.map((record) => record.executionId), ["b", "a"]);
});

test("ExecutionRegistry keeps rolling output buffer and evicts by TTL", () => {
  let now = 0;
  const registry = new InMemoryExecutionRegistry({
    maxLines: 3,
    ttlMs: 100,
    now: () => now
  });

  registry.start({
    executionId: "exec-1",
    channelId: "telegram",
    chatId: "chat-1",
    agentName: "copilot",
    startedAt: now
  });

  registry.append("exec-1", "one\ntwo\nthree\nfour");
  assert.deepEqual(registry.get("exec-1")?.outputLines, ["two", "three", "four"]);

  registry.complete("exec-1", 10);
  now = 200;

  assert.equal(registry.list("telegram", "chat-1").length, 0);
});

test("ExecutionRegistry does not evict running executions", () => {
  let now = 0;
  const registry = new InMemoryExecutionRegistry({
    ttlMs: 10,
    now: () => now
  });

  registry.start({
    executionId: "live",
    channelId: "telegram",
    chatId: "chat-1",
    agentName: "claude",
    startedAt: 0
  });

  now = 1_000;

  const records = registry.list("telegram", "chat-1");
  assert.equal(records.length, 1);
  assert.equal(records[0]?.executionId, "live");
});
