---
status: complete
created: 2026-02-24
priority: medium
tags:
- agent-runtime
- session
- copilot
depends_on:
- 011-session-runtime-foundation
parent: 007-agent-session-runtime
created_at: 2026-02-24T06:35:01.720490Z
updated_at: 2026-02-24T07:04:05.529388Z
completed_at: 2026-02-24T07:04:05.529388Z
transitions:
- status: complete
  at: 2026-02-24T07:04:05.529388Z
---

# Copilot CLI Session Integration

> **Status**: planned · **Priority**: high · **Created**: 2026-02-24
> **North Star**: Wire GitHub Copilot CLI (`copilot -p`) into the `AgentSession` interface using the transcript-fallback strategy, so multi-turn conversations with Copilot maintain context across messages even though the CLI has no native session resumption.

## Overview

Unlike Claude Code and Gemini CLI, `copilot -p` has no native session identifier. Each invocation is stateless from the CLI's perspective. To preserve conversation context, `CopilotSession` maintains a local transcript (list of `{role, content}` turns) and prepends prior turns to each new prompt.

This spec builds on the core session infrastructure from spec 007 and produces a concrete `CopilotSession` implementation.

## Design

### Invocation Pattern

Every call re-invokes the CLI with the full accumulated context injected into the prompt:

```
copilot -p "<transcript + latest user message>"
```

The transcript is formatted as a plain-text conversation header prepended to the user's message:

```
Previous conversation:
User: <turn 1>
Assistant: <turn 1 reply>
User: <turn 2>
Assistant: <turn 2 reply>

User: <current message>
```

### `CopilotSession` Sketch

```ts
export class CopilotSession implements AgentSession {
  private state: TranscriptSessionState = { strategy: "transcript", turns: [] };

  async send(userText: string, executionId: string, eventBus: EventBus): Promise<string> {
    const prompt = buildPrompt(this.state.turns, userText);
    const { stdout } = await spawnAndCollect("copilot", ["-p", prompt]);
    const response = stripAnsi(stdout.trim());

    this.state.turns.push({ role: "user", content: userText });
    this.state.turns.push({ role: "assistant", content: response });

    return response;
  }
}
```

### Transcript Pruning

To avoid exceeding prompt limits, the transcript is capped at the most recent N turns (configurable, default: 10). Older turns are dropped when the cap is reached.

## Plan

- [x] Implement `CopilotSession` in `runtime/session/copilotSession.ts`
- [x] Add `buildPrompt` helper that formats the transcript + latest message into a single string
- [x] Add `maxTurns` option (default 10) to cap transcript size
- [x] Register `"session-copilot"` in the `createRuntime` factory (from spec 007)
- [x] Add unit tests: transcript accumulation, pruning at `maxTurns`, correct `copilot -p` args

## Test

- [x] First call invokes `copilot -p "<message>"` with no prior context
- [x] Second call prepends the first turn pair to the prompt
- [x] After `maxTurns` turns, oldest turns are pruned and not included in subsequent prompts
- [x] Response text is stripped of ANSI codes before being stored in the transcript and returned