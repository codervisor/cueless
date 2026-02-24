---
status: complete
created: 2026-02-24
priority: medium
tags:
- agent-runtime
- session
- claude
depends_on:
- 011-session-runtime-foundation
parent: 007-agent-session-runtime
created_at: 2026-02-24T06:34:11.950438Z
updated_at: 2026-02-24T07:04:05.489989Z
completed_at: 2026-02-24T07:04:05.489989Z
transitions:
- status: complete
  at: 2026-02-24T07:04:05.489989Z
---

# Claude Code Session Integration

> **Status**: planned · **Priority**: high · **Created**: 2026-02-24
> **North Star**: Wire Claude Code (`claude` CLI) into the `AgentSession` interface using its native session resumption flag (`--resume`), so multi-turn conversations with Claude Code persist across user messages without re-sending the full transcript.

## Overview

Claude Code supports native session resumption: after a first-run session is created, subsequent calls can pass `--resume <id>` to continue the same conversation. This is the preferred strategy because Claude Code preserves tool calls, file context, and internal memory — not just text turns.

This spec builds on the core session infrastructure from spec 007 and produces a concrete `ClaudeSession` implementation.

## Design

### Invocation Pattern

| Turn       | Command                                              |
| ---------- | ---------------------------------------------------- |
| First      | `claude -p "<user text>"`                            |
| Subsequent | `claude --resume <nativeSessionId> -p "<user text>"` |

### Session ID Discovery

Claude Code writes the session ID to stdout during the first run (or it can be inferred from `~/.claude/projects/`). `ClaudeSession` parses the session ID from stdout on the first call and stores it as `nativeSessionId`. All subsequent calls pass `--resume <nativeSessionId>`.

### `ClaudeSession` Sketch

```ts
export class ClaudeSession implements AgentSession {
  private state: NativeSessionState | undefined;

  async send(userText: string, executionId: string, eventBus: EventBus): Promise<string> {
    const args = this.state
      ? ["--resume", this.state.nativeSessionId, "-p", userText]
      : ["-p", userText];

    const { stdout } = await spawnAndCollect("claude", args);

    if (!this.state) {
      this.state = { strategy: "native", nativeSessionId: parseSessionId(stdout) };
    }

    return stripAnsi(stdout);
  }
}
```

### Output Parsing

- Strip ANSI escape codes from stdout before returning the response.
- `parseSessionId(stdout)` extracts the session ID from Claude's output. Exact format to be verified against the installed `claude` binary version during implementation; fall back to scanning `~/.claude/projects/` if the ID is not present in stdout.

### Fallback

If `--resume <id>` fails (e.g., the session has expired on Claude's side), `ClaudeSession` falls back to a fresh session and resets `state`.

## Plan

- [x] Implement `ClaudeSession` in `runtime/session/claudeSession.ts`
- [x] Add `parseSessionId` helper to extract the native session ID from stdout (or `~/.claude/projects/`)
- [x] Add `stripAnsi` utility (or reuse if already present)
- [x] Register `"session-claude"` in the `createRuntime` factory (from spec 007)
- [x] Add unit tests: first call builds correct args; second call includes `--resume <id>`; fallback on expired session

## Test

- [x] First call to `ClaudeSession.send()` invokes `claude -p "<text>"` with no `--resume` flag
- [x] Second call includes `--resume <parsedSessionId> -p "<text>"`
- [x] Session ID is correctly parsed from a sample stdout fixture
- [x] ANSI codes are stripped from the returned response string
- [x] If `--resume` fails, `ClaudeSession` retries as a fresh session and updates `nativeSessionId`