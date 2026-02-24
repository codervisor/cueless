import assert from "assert";
import test from "node:test";
import { AgentConfig } from "../src/config";
import { EventBus } from "../src/events/eventBus";
import { createLogger } from "../src/logging";
import { CliRuntime } from "../src/runtime/cliRuntime";
import { createRuntime } from "../src/runtime";
import { InMemorySessionManager } from "../src/runtime/session/inMemorySessionManager";
import { SessionRuntime } from "../src/runtime/session/sessionRuntime";
import { AgentSession } from "../src/runtime/session/types";

class FakeSession implements AgentSession {
  closed = false;

  constructor(
    readonly sessionId: string,
    readonly channelId: string,
    readonly chatId: string,
    private readonly response: string = "ok"
  ) { }

  async send(): Promise<string> {
    return this.response;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

test("InMemorySessionManager reuses session for same channel/chat/agent", () => {
  const logger = createLogger("error");
  let created = 0;
  const manager = new InMemorySessionManager({
    logger,
    sessionTimeoutMs: 1_000,
    createSession: (channelId, chatId, agentName) => {
      created += 1;
      return new FakeSession(`${agentName}-${created}`, channelId, chatId);
    }
  });

  const first = manager.getOrCreate("telegram", "chat-1", "claude");
  const second = manager.getOrCreate("telegram", "chat-1", "claude");

  assert.equal(created, 1);
  assert.strictEqual(first, second);
});

test("InMemorySessionManager evicts idle sessions after TTL", async () => {
  const logger = createLogger("error");
  let now = 0;
  let created = 0;
  const sessions: FakeSession[] = [];

  const manager = new InMemorySessionManager({
    logger,
    sessionTimeoutMs: 10,
    now: () => now,
    createSession: (channelId, chatId, agentName) => {
      created += 1;
      const session = new FakeSession(`${agentName}-${created}`, channelId, chatId);
      sessions.push(session);
      return session;
    }
  });

  const first = manager.getOrCreate("telegram", "chat-1", "claude");
  now = 11;
  const second = manager.getOrCreate("telegram", "chat-1", "claude");

  assert.notStrictEqual(first, second);
  assert.equal(created, 2);
  assert.equal(sessions[0]?.closed, true);

  await manager.closeAll();
});

test("SessionRuntime emits aggregated complete response", async () => {
  const logger = createLogger("error");
  const events: Array<{ type: string; response?: string }> = [];
  const eventBus = new EventBus();
  const session = new FakeSession("s-1", "telegram", "chat-1", "aggregated response");

  const manager = {
    getOrCreate: () => session,
    close: async () => { },
    closeAll: async () => { }
  };

  const runtime = new SessionRuntime({
    name: "claude",
    runtime: "session-claude",
    command: "claude"
  }, manager, logger);

  eventBus.on((event) => {
    events.push({ type: event.type, response: event.payload?.response });
  });

  await runtime.execute({ channelId: "telegram", chatId: "chat-1", text: "hello" }, "exec-1", eventBus);

  assert.deepEqual(events, [{ type: "complete", response: "aggregated response" }]);
});

test("createRuntime keeps CLI runtime default and dispatches session runtime", () => {
  const logger = createLogger("error");

  const cliAgent: AgentConfig = {
    name: "default",
    command: "echo"
  };

  const sessionAgent: AgentConfig = {
    name: "copilot",
    command: "gh",
    runtime: "session-copilot"
  };

  assert.ok(createRuntime(cliAgent, logger) instanceof CliRuntime);
  assert.ok(createRuntime(sessionAgent, logger) instanceof SessionRuntime);
});