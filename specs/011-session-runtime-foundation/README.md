---
status: planned
created: 2026-02-24
priority: high
tags:
- agent-runtime
- session
parent: 007-agent-session-runtime
depends_on:
- 006-multi-channel-agent-hub
created_at: 2026-02-24T06:48:34.888516Z
updated_at: 2026-02-24T06:48:34.888516Z
---

# Session Runtime Foundation

> **Status**: planned · **Priority**: high · **Created**: 2026-02-24
> **North Star**: Deliver the shared session infrastructure — `AgentSession` / `SessionManager` interfaces, `InMemorySessionManager` with TTL eviction, `SessionRuntime`, and `AgentConfig` extension — that all agent-specific integrations (Claude, Gemini, Copilot) build on.

## Overview

This spec delivers the **core plumbing** for stateful agent sessions. It introduces:

1. **`AgentSession` interface** — the contract every agent implementation fulfills.
2. **`SessionManager`** — owns the map of active sessions, creates them via a factory, and evicts idle ones.
3. **`SessionRuntime`** — a new `Runtime` implementation that delegates to `SessionManager` instead of spawning a raw process per message.
4. **Response aggregation** — accumulates all stdout into a buffer and sends a single `complete` event, suppressing per-chunk IM spam.
5. **`AgentConfig` extension** — adds `runtime` discriminator and `sessionTimeoutMs`.

Individual agent implementations (Claude Code, Gemini CLI, Copilot CLI) are delivered in sibling specs that depend on this one.

## Design

### Session Lifecycle

```
User Message (channelId + chatId)
        │
        ▼
  SessionManager.getOrCreate(channelId, chatId, agentName)
        │
        ▼
  AgentSession.send(message.text)
        │  ← delegates to agent-specific implementation
        ▼
  AgentSession.response() → string
        │
        ▼
  IMAdapter.sendMessage(chatId, response)
```

### `AgentSession`

```ts
export interface AgentSession {
  readonly sessionId: string;
  readonly channelId: string;
  readonly chatId: string;
  send(userText: string, executionId: string, eventBus: EventBus): Promise<string>;
  close(): Promise<void>;
}
```

### `SessionManager`

```ts
export interface SessionManager {
  getOrCreate(channelId: string, chatId: string, agentName: string): AgentSession;
  close(channelId: string, chatId: string): Promise<void>;
  closeAll(): Promise<void>;
}
```

### `SessionRuntime`

```ts
export class SessionRuntime implements Runtime {
  constructor(
    private readonly config: AgentConfig,
    private readonly sessionManager: SessionManager,
    private readonly logger: Logger
  ) {}

  async execute(message: IMMessage, executionId: string, eventBus: EventBus): Promise<void> {
    const session = this.sessionManager.getOrCreate(
      message.channelId,
      message.chatId,
      this.config.name
    );
    const response = await session.send(message.text, executionId, eventBus);
    eventBus.emit({ executionId, channelId: message.channelId, chatId: message.chatId,
      type: "complete", timestamp: Date.now(), payload: { response } });
  }
}
```

### Session State Shapes

```ts
// Native-session-backed (Claude, Gemini)
interface NativeSessionState {
  strategy: "native";
  nativeSessionId: string;
}

// Transcript-backed (Copilot CLI, Generic)
interface TranscriptSessionState {
  strategy: "transcript";
  turns: Array<{ role: "user" | "assistant"; content: string }>;
}
```

### `AgentConfig` Extension

```ts
export interface AgentConfig {
  name: string;
  runtime?: "cli" | "session-claude" | "session-gemini" | "session-copilot";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  workingDir?: string;
  timeoutMs?: number;
  sessionTimeoutMs?: number; // idle session TTL (default: 30 min)
}
```

When `runtime` is absent or `"cli"`, the existing `CliRuntime` is used unchanged.

## Plan

- [ ] Define `AgentSession`, `NativeSessionState`, `TranscriptSessionState`, and `SessionManager` interfaces in `runtime/session/types.ts`
- [ ] Implement `InMemorySessionManager` with TTL-based idle eviction
- [ ] Implement `SessionRuntime` wiring `SessionManager` into the `Runtime` interface
- [ ] Extend `AgentConfig` with `runtime` and `sessionTimeoutMs` fields
- [ ] Update `createRuntime` factory in `runtime/index.ts` to dispatch on `runtime` type
- [ ] Update `ChannelHub` to suppress per-chunk messages for session-backed executions and send the aggregated `complete.response` instead
- [ ] Add unit tests for `SessionManager` TTL eviction and `SessionRuntime` dispatch

## Test

- [ ] Two messages on the same `channelId+chatId` reuse the same `AgentSession` (no new process spawned for the second message)
- [ ] Idle session is evicted after `sessionTimeoutMs` and a fresh session begins on the next message
- [ ] A single agent response produces exactly one IM message (no per-chunk spam)
- [ ] `CliRuntime` continues to work unchanged when `runtime` is absent or `"cli"`
