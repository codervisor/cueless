---
status: planned
created: '2026-02-24'
tags:
  - architecture
  - hub
  - multi-channel
  - agent-runtime
priority: high
depends_on:
  - 001-bootstrap-cueless
  - 005-cli-daemon-service-mode
created_at: '2026-02-24T04:37:33.701617+00:00'
---

# Multi-Channel Agent Hub

> **Status**: planned · **Priority**: high · **Created**: 2026-02-24
> **North Star**: cueless is the central hub — IM channels flow in, agent runtimes execute, responses flow back out to the originating channel.

## Overview

Today cueless wires a single `IMAdapter` to a single `Runtime`. This covers the bootstrapped use case, but the product vision is broader: cueless should act as an **event-hub** that aggregates inbound messages from multiple IM channels simultaneously and dispatches them to the most appropriate local agent runtime (Claude, Copilot, Codex, Gemini, opencode, etc.).

**Problems with the current design:**
- `Gateway` is 1:1 — one adapter, one runtime, hardwired at startup
- `IMMessage` has no channel identity — responses can't be routed back across adapters
- `ExecutionEvent` only tracks `chatId`, not which channel (adapter) originated the message
- No concept of multiple runtimes or runtime selection

**Goals:**
- Run any number of IM adapters concurrently (Telegram, Slack, Discord, WhatsApp, …)
- Maintain a registry of local agent runtimes
- Route each inbound message to a selected runtime via a pluggable routing strategy
- Route execution events (stdout, stderr, complete, error) back to the exact channel + chat that originated the request

## Design

The hub replaces the 1:1 `Gateway` with a `ChannelHub` that fans in from multiple `IMAdapter` instances and fans out to an `AgentRegistry` via a `Router`. `channelId` threads through every message and event so responses always return to the originating channel.

### Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         ChannelHub                               │
│                                                                  │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐           │
│  │  Telegram   │   │    Slack    │   │   Discord   │  ...       │
│  │  Adapter    │   │   Adapter   │   │   Adapter   │           │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘           │
│         │                 │                 │                   │
│         └─────────────────┼─────────────────┘                  │
│                           │ IMMessage (+ channelId)              │
│                    ┌──────▼──────┐                              │
│                    │   Router    │ ← routing strategy             │
│                    └──────┬──────┘                              │
│                           │                                     │
│         ┌─────────────────┼─────────────────┐                  │
│         │                 │                 │                   │
│  ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐          │
│  │    Claude   │   │   Gemini    │   │   Codex     │  ...      │
│  │   Runtime   │   │   Runtime   │   │   Runtime   │          │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘          │
│         └─────────────────┼─────────────────┘                  │
│                           │ ExecutionEvent (+ channelId)         │
│                    ┌──────▼──────┐                              │
│                    │  EventBus   │                              │
│                    └──────┬──────┘                              │
│                           │                                     │
│         ┌─────────────────┼─────────────────┐                  │
│         │                 │                 │                   │
│  ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐          │
│  │  Telegram   │   │    Slack    │   │   Discord   │           │
│  │  Adapter   │   │   Adapter   │   │   Adapter   │           │
│  └─────────────┘   └─────────────┘   └─────────────┘          │
└──────────────────────────────────────────────────────────────────┘
```

### Data Model Changes

#### `IMMessage` — add `channelId`

```ts
export interface IMMessage {
  channelId: string;   // NEW: identifies which IMAdapter this came from
  chatId: string;
  userId?: string;
  text: string;
  raw?: unknown;
}
```

#### `ExecutionEvent` — add `channelId`

```ts
export interface ExecutionEvent {
  executionId: string;
  channelId: string;   // NEW: mirrors IMMessage.channelId for routing
  chatId: string;
  type: ExecutionEventType;
  timestamp: number;
  payload?: { ... };
}
```

#### `IMAdapter` — add `id`

```ts
export interface IMAdapter {
  id: string;          // NEW: stable identifier, e.g. "telegram", "slack"
  start: (onMessage: (message: IMMessage) => void) => Promise<void>;
  sendMessage: (chatId: string, text: string) => Promise<void>;
  stop: () => Promise<void>;
}
```

### New Components

#### `ChannelHub` (`/src/hub/hub.ts`)

Replaces the current `Gateway`. Owns a collection of `IMAdapter` instances keyed by `id`. On startup, all adapters are started concurrently. Inbound messages are enriched with `channelId` from the adapter, then forwarded to the `Router`. Execution events are dispatched to the adapter with the matching `channelId`.

```ts
export class ChannelHub {
  constructor(
    private adapters: Map<string, IMAdapter>,
    private router: Router,
    private eventBus: EventBus,
    private logger: Logger
  ) {}

  async start(): Promise<void>;
  async stop(): Promise<void>;
  private handleMessage(message: IMMessage): Promise<void>;
  private subscribeEvents(): void;
}
```

#### `AgentRegistry` (`/src/hub/agentRegistry.ts`)

Holds named `Runtime` instances. Provides lookup by name.

```ts
export class AgentRegistry {
  register(name: string, runtime: Runtime): void;
  get(name: string): Runtime | undefined;
  list(): string[];
  default(): Runtime;
}
```

#### `Router` (`/src/hub/router.ts`)

Selects which `Runtime` handles a given `IMMessage`. Pluggable strategy interface with two built-in strategies:

1. **Prefix strategy** — `@claude do X`, `@gemini explain Y` routes to the named runtime; strips the prefix before forwarding
2. **Channel-default strategy** — each channel is assigned a default runtime in config; falls back to the global default

```ts
export interface Router {
  select(message: IMMessage): { runtime: Runtime; message: IMMessage };
}
```

### Config Schema Changes

```ts
export interface ChannelConfig {
  type: "telegram" | "slack" | "discord";   // adapter type
  id?: string;                               // override adapter id (defaults to type)
  defaultAgent?: string;                     // runtime name for this channel
  // adapter-specific options (token, etc.)
  [key: string]: unknown;
}

export interface AgentConfig {
  name: string;                              // e.g. "claude", "gemini", "codex"
  command: string;                           // CLI command to spawn
  args?: string[];
  env?: Record<string, string>;
}

export interface Config {
  channels: ChannelConfig[];                 // replaces single `telegram` block
  agents: AgentConfig[];                     // replaces single `runtime` block
  defaultAgent?: string;                     // fallback if no match
}
```

### Routing Strategy Decision

The default routing order is:

1. **Prefix match** — if message starts with `@<agentName>`, use that agent (strip prefix)
2. **Channel default** — use the `defaultAgent` for the originating channel
3. **Global default** — use `config.defaultAgent` or the first registered agent

This allows per-channel agent assignment and per-message overrides without changing config.

## Plan

- [ ] Update `IMMessage` type: add `channelId` field
- [ ] Update `ExecutionEvent` type: add `channelId` field
- [ ] Update `IMAdapter` interface: add `id` field
- [ ] Update `TelegramAdapter`: set `id = "telegram"`, populate `channelId` in messages
- [ ] Create `AgentRegistry` (`/src/hub/agentRegistry.ts`)
- [ ] Create `Router` interface + default implementation (`/src/hub/router.ts`)
- [ ] Create `ChannelHub` (`/src/hub/hub.ts`): multi-adapter lifecycle + event routing
- [ ] Update `Config` schema: `channels[]` and `agents[]` replacing single-adapter/runtime fields
- [ ] Update `createRuntime` factory: read `agents[]` from config and populate `AgentRegistry`
- [ ] Update `index.ts` / `startDaemon()`: wire `ChannelHub` instead of `Gateway`
- [ ] Update CLI runtime adapter to accept `AgentConfig` (command + args + env)
- [ ] Update tests and mocks: add `channelId` to fixtures

## Test

- [ ] Single channel (Telegram) + single agent (existing behavior) works unchanged
- [ ] Two adapters started concurrently; messages from each are delivered independently
- [ ] `@claude` prefix routes to Claude runtime; `@gemini` routes to Gemini runtime
- [ ] Channel-default agent assignment: channel `slack` defaults to `codex`, channel `telegram` defaults to `claude`
- [ ] Execution event `channelId` matches the originating adapter — response sent to correct channel
- [ ] Unknown `@agent` prefix falls back to channel default / global default
- [ ] `AgentRegistry.list()` returns all registered agent names
- [ ] `ChannelHub.stop()` gracefully stops all adapters

## Notes

- The existing `Gateway` class should be preserved or aliased during migration to avoid breaking the daemon/service layer in spec 005.
- Future: routing strategy could be extended to a config-driven rule engine (regex on message text, user allowlist, round-robin load balancing).
- Future: `channelId` could encode multi-instance channels, e.g. `telegram-personal` vs `telegram-work` if the same provider is configured twice.
- Agent CLI runtimes (Claude Code, Gemini CLI, opencode, etc.) are still spawned as subprocesses — the `CliRuntime` pattern from spec 001 is preserved; only the registry and dispatch layer is new.
