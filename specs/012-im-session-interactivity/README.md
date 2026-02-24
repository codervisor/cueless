---
status: complete
created: 2026-02-24
priority: high
tags:
- session
- hub
- streaming
- telegram
- interactivity
depends_on:
- 011-session-runtime-foundation
- 006-multi-channel-agent-hub
created_at: 2026-02-24T08:17:35.015779Z
updated_at: 2026-02-24T09:05:46.870311Z
completed_at: 2026-02-24T09:05:46.870311Z
transitions:
- status: in-progress
  at: 2026-02-24T08:57:42.438962Z
- status: complete
  at: 2026-02-24T09:05:46.870311Z
---

# IM Session Interactivity

> **Status**: planned · **Priority**: high · **Created**: 2026-02-24
> **North Star**: When a long-running agent session is triggered from Telegram (or any IM channel), the user can check its live status and retrieve its output log at any time — without waiting for completion.

## Overview

Today every agent session (`ClaudeSession`, `GeminiSession`, `CopilotSession`) uses `spawnAndCollect`, which buffers all stdout/stderr until the process exits and then emits a single `complete` event. For long-running sessions this means:

- No feedback during execution — the user's IM chat is silent until the process exits
- No way to check whether the session is still alive
- No way to retrieve captured output after the fact if the final message is missed

**Two capabilities are needed:**

1. **Streaming output** — emit `stdout`/`stderr` events progressively as the process produces output, so the IM user sees live updates.
2. **On-demand query** — the user can send `/status <id>` or `/logs <id>` at any time to inspect a running or completed execution without being flooded by live events.

Both changes are additive — existing interfaces (`AgentSession`, `Runtime`, `EventBus`, `ChannelHub`) are extended but not replaced.

## Design

### 1. Streaming: `spawnAndStream`

A new runner in `runtime/session/utils.ts` that calls an `onChunk` callback on each data chunk rather than buffering:

```ts
export const spawnAndStream: CommandRunner = async (
  command: string,
  args: string[],
  options?: { cwd?: string; env?: Record<string, string>; timeoutMs?: number },
  onChunk?: (type: "stdout" | "stderr", text: string) => void
): Promise<CommandResult>
```

`spawnAndStream` still resolves with the full `CommandResult` (stdout + stderr + code) so existing callers that check `result.code` or `result.stderr` continue to work. The `onChunk` parameter is optional — when omitted, behaviour degrades to `spawnAndCollect`.

#### Session changes

Each session (`ClaudeSession`, `GeminiSession`, `CopilotSession`) passes an `onChunk` callback to `spawnAndStream` that emits events on the `EventBus`:

```ts
// inside ClaudeSession.execute()
const result = await this.run(this.config.command, args, options, (type, text) => {
  eventBus.emit({
    executionId,
    channelId: this.channelId,
    chatId: this.chatId,
    type,          // "stdout" | "stderr"
    timestamp: Date.now(),
    payload: { text }
  });
});
```

`executionId` and `eventBus` are already threaded through `AgentSession.send(userText, executionId, eventBus)` — no interface changes needed.

The `ChannelHub`'s existing `subscribeEvents()` already handles `stdout`/`stderr` event types and forwards them to `adapter.sendMessage()` — so live output flows to the chat automatically once sessions emit those events.

#### Chunk throttling

Raw stdout chunks arrive faster than Telegram's rate limits allow (~1 message/second per chat). A `ChunkThrottler` helper coalesces chunks within a time window before forwarding them as a single IM message:

```ts
export class ChunkThrottler {
  constructor(
    private readonly flushIntervalMs: number,   // default: 1000
    private readonly maxChunkLength: number,    // default: 3500
    private readonly send: (text: string) => Promise<void>
  ) {}

  push(text: string): void;  // buffer and schedule a flush
  flush(): Promise<void>;    // force-flush (called on complete/error)
  destroy(): void;           // cancel pending timers
}
```

One `ChunkThrottler` instance is created per `(channelId, chatId)` pair in `ChannelHub.subscribeEvents()`. Throttlers are destroyed when a `complete` or `error` event is received for that execution.

### 2. Execution Registry

A new `InMemoryExecutionRegistry` in `hub/executionRegistry.ts` tracks the lifecycle of every execution:

```ts
export interface ExecutionRecord {
  executionId: string;
  channelId: string;
  chatId: string;
  agentName: string;
  status: "running" | "complete" | "error";
  startedAt: number;
  finishedAt?: number;
  outputLines: string[];   // rolling buffer — last MAX_LINES lines of stdout+stderr
  errorReason?: string;
}

export interface ExecutionRegistry {
  start(params: {
    executionId: string;
    channelId: string;
    chatId: string;
    agentName: string;
    startedAt: number;
  }): void;
  append(executionId: string, text: string): void;
  complete(executionId: string, finishedAt: number): void;
  error(executionId: string, reason: string, finishedAt: number): void;
  get(executionId: string): ExecutionRecord | undefined;
  list(channelId: string, chatId: string): ExecutionRecord[];
}
```

`InMemoryExecutionRegistry` is wired into `ChannelHub` and updated by its `EventBus` subscription:

| Event type        | Registry call                                    |
| ----------------- | ------------------------------------------------ |
| `start`           | `registry.start(...)`                            |
| `stdout`/`stderr` | `registry.append(executionId, text)`             |
| `complete`        | `registry.complete(executionId, timestamp)`      |
| `error`           | `registry.error(executionId, reason, timestamp)` |

**Retention policy**:
- Rolling buffer: keep the last 200 lines per execution (`outputLines`). Lines are split on `\n` after stripping ANSI codes.
- TTL eviction: completed/errored records are evicted after 1 hour. Eviction runs lazily on each `list()` call and proactively on each `start()` call.
- Running executions are never evicted.

### 3. Built-in Commands in `ChannelHub`

Before routing a message to the agent, `handleMessage` checks for built-in `/` commands (exact prefix match, case-insensitive):

```
/status <executionId>   — one-line status summary
/logs <executionId>     — last N lines of captured stdout+stderr
/list                   — recent executions for this chat, newest first
```

A helper `parseBuiltinCommand(text: string)` extracts the command and argument:

```ts
type BuiltinCommand =
  | { type: "status"; executionId: string }
  | { type: "logs"; executionId: string }
  | { type: "list" }
  | null;
```

**Response format examples:**

`/status abc123` while running:
```
⏳ Running (42s) · abc123
Last output: Analyzing project structure...
```

`/status abc123` after completion:
```
✅ Complete (12s) · abc123
Finished: 2026-02-24T08:00:13Z
```

`/status abc123` after error:
```
❌ Error (5s) · abc123
Reason: Claude command exited with code 1.
```

`/status abc123` — unknown ID:
```
Unknown execution ID: abc123
```

`/logs abc123`:
```
[stdout] Analyzing project structure...
[stdout] Reading 12 files...
[stderr] Warning: no tsconfig found
```

`/list`:
```
Recent executions (this chat):
• abc123 ✅ Complete 08:00:01Z
• def456 ⏳ Running  08:01:30Z
• ghi789 ❌ Error    07:59:45Z
```

**Unrecognised `/` commands** (e.g., `/help`, `/start`) fall through to the router unchanged — agents may handle their own slash commands.

### Architecture After This Spec

```
Telegram msg → ChannelHub.handleMessage()
  ├─ [/status|/logs|/list] → ExecutionRegistry.get/list() → adapter.sendMessage()
  └─ [agent message]
       ├─ ExecutionRegistry.start(...)
       ├─ reply "Received command. Execution ID: <id>"
       └─ runtime.execute(routedMessage, executionId, eventBus)  [non-blocking]
            └─ SessionRuntime → session.send(text, executionId, eventBus)
                 └─ spawnAndStream(command, args, options, onChunk)
                      ├─ onChunk("stdout"|"stderr", text)
                      │    └─ eventBus.emit({ type: "stdout"|"stderr", ... })
                      │         ├─ ChunkThrottler.push(text) → adapter.sendMessage() [live]
                      │         └─ ExecutionRegistry.append(executionId, text)
                      └─ on close → session resolves → SessionRuntime emits "complete"
                           ├─ ChunkThrottler.flush() + destroy()
                           └─ ExecutionRegistry.complete(executionId, ...)
```

### Files Changed / Created

| File                                | Change                                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `runtime/session/utils.ts`          | Add `spawnAndStream`; extend `CommandRunner` type to accept optional `onChunk`                              |
| `runtime/session/claudeSession.ts`  | Pass `onChunk` to runner in `execute()`                                                                     |
| `runtime/session/geminiSession.ts`  | Pass `onChunk` to runner in `execute()`                                                                     |
| `runtime/session/copilotSession.ts` | Pass `onChunk` to runner in `execute()`                                                                     |
| `hub/executionRegistry.ts`          | New — `ExecutionRecord`, `ExecutionRegistry` interface, `InMemoryExecutionRegistry`                         |
| `hub/chunkThrottler.ts`             | New — `ChunkThrottler`                                                                                      |
| `hub/hub.ts`                        | Wire `ExecutionRegistry`, `ChunkThrottler` instances; add `parseBuiltinCommand`; extend `subscribeEvents()` |

### Logging note

`ExecutionRegistry.outputLines` captures agent stdout/stderr — separate from the structured daemon `Logger` (debug/info/warn/error lines written to the process console). `/logs <id>` returns agent output only. Daemon logs remain on disk/console and are intentionally not exposed to IM users.

## Acceptance Criteria

- Sending a long-running prompt to the Telegram bot yields stdout chunks in the chat as they arrive (within ~1 second batching window).
- `/status <id>` returns the correct status and last output line for both running and finished executions.
- `/logs <id>` returns up to the last 200 lines of captured agent output.
- `/list` returns up to the 10 most recent executions for the originating chat.
- Unknown execution IDs return a clear "Unknown execution ID" message rather than an error or silence.
- Existing `CliRuntime` sessions (non-session-* runtimes) are also tracked in the registry.
- Completed/errored records are evicted after 1 hour; no memory leak for long-running daemons.
- All new components have unit tests; existing session and hub tests continue to pass.

## Plan

- [x] Extend `CommandRunner` type and add `spawnAndStream` in `runtime/session/utils.ts`
- [x] Update `ClaudeSession`, `GeminiSession`, `CopilotSession` to pass `onChunk` to the runner
- [x] Implement `ChunkThrottler` in `hub/chunkThrottler.ts`
- [x] Implement `InMemoryExecutionRegistry` in `hub/executionRegistry.ts`
- [x] Wire `ExecutionRegistry` and `ChunkThrottler` into `ChannelHub` (`hub/hub.ts`): update `subscribeEvents()`, `handleMessage()`
- [x] Add `parseBuiltinCommand` and command-intercept logic in `ChannelHub.handleMessage()`
- [x] Unit tests: `spawnAndStream` streaming + fallback, `ChunkThrottler` coalescing + flush, `InMemoryExecutionRegistry` CRUD + TTL eviction + rolling buffer, `parseBuiltinCommand` parsing, hub command intercept routing