---
status: planned
created: 2026-03-25
priority: high
tags:
- cli
- config
- channels
- agents
- management
depends_on:
- 005-cli-daemon-service-mode
- 006-multi-channel-agent-hub
created_at: 2026-03-25T23:46:47.956947452Z
updated_at: 2026-03-25T23:46:47.956947452Z
---

# CLI Config Management — Git-Style Channel & Agent Commands

## Overview

Replace `CHANNELS_JSON` and `AGENTS_JSON` environment variables with git-style CLI management commands. Env vars remain for bootstrap (single Telegram bot token), but multi-channel/multi-agent config is managed via `telegramable channel` and `telegramable agent` subcommands — persisted to a local config store.

This approach also makes config manageable from Telegram (`/channel add ...`) and the web UI, since the same config store is shared.

> **Status**: planned · **Priority**: high · **Created**: 2026-03-25
> **North Star**: `telegramable channel add telegram --token=xxx` — manage channels and agents like git manages remotes.

## Design

### CLI Commands

```bash
# Channels
telegramable channel list
telegramable channel add telegram --id=main --token=$BOT_TOKEN
telegramable channel remove main
telegramable channel show main

# Agents
telegramable agent list
telegramable agent add claude --runtime=session-claude-sdk --model=claude-sonnet-4-6
telegramable agent remove claude
telegramable agent show claude
telegramable agent default claude

# Config (general settings)
telegramable config get log-level
telegramable config set log-level debug
```

### Config Store

- Persisted to `~/.telegramable/config.json` (or `$TELEGRAMABLE_CONFIG_DIR`)
- Env vars (`TELEGRAM_BOT_TOKEN`, `DEFAULT_AGENT`, etc.) serve as bootstrap defaults
- CLI commands write to the store, which takes precedence over env vars
- Same store is readable/writable from Telegram bot commands and web UI

### Config Hierarchy (lowest to highest priority)

1. Built-in defaults
2. Environment variables (`.env`, Railway, Docker)
3. Config store (`~/.telegramable/config.json`)
4. CLI flags (per-invocation overrides)

### Simplified Env Vars (bootstrap only)

```bash
TELEGRAM_BOT_TOKEN=        # Single Telegram channel
TELEGRAM_CHANNEL_ID=       # Channel identifier
DEFAULT_AGENT=claude       # Default agent name
RUNTIME_COMMAND=claude     # Legacy single-agent fallback
LOG_LEVEL=info
```

`CHANNELS_JSON` and `AGENTS_JSON` are removed.

## Plan

- [ ] Remove `CHANNELS_JSON` and `AGENTS_JSON` from config parser
- [ ] Remove JSON config references from README and .env.example
- [ ] Create config store module (`packages/core/src/config/store.ts`) — read/write JSON file
- [ ] Add `telegramable channel list|add|remove|show` subcommands to CLI
- [ ] Add `telegramable agent list|add|remove|show|default` subcommands to CLI
- [ ] Add `telegramable config get|set` subcommands
- [ ] Merge config store with env var defaults at startup
- [ ] Update tests

## Test

- [ ] `telegramable channel add telegram --token=xxx` persists to config store
- [ ] `telegramable channel list` shows channels from both env vars and store
- [ ] `telegramable agent default claude` sets default agent
- [ ] Env vars still work as bootstrap for single-channel setups
- [ ] Config store takes precedence over env vars
- [ ] Removing all store entries falls back cleanly to env vars

## Notes

- Same config store can be exposed via Telegram commands (`/channel list`) and web UI API endpoints later
- Config file location follows XDG conventions (`~/.telegramable/` or `$TELEGRAMABLE_CONFIG_DIR`)
- For Docker/Railway: env vars are the primary config method. CLI commands are for local dev and advanced setups.
