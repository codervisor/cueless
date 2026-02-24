---
status: complete
created: 2026-02-24
priority: high
tags:
- cli
- daemon
- service
- architecture
depends_on:
- 001-bootstrap-cueless
created_at: 2026-02-24T03:44:29.495796Z
updated_at: 2026-02-24T05:22:30.286201Z
transitions:
- status: in-progress
  at: 2026-02-24T03:45:02.924912Z
---
# CLI Daemon & Service Mode

> **Status**: planned · **Priority**: high · **Created**: 2026-02-24
> **North Star**: cueless should be operated as a proper CLI tool — start in foreground, install as a background service, check status — inspired by zeroclaw's UX

## Overview

Currently `apps/api/src/index.ts` directly bootstraps and starts everything on process launch. There is no CLI layer — you either run it or you don't. This means:
- No way to start/stop/restart without killing the process
- No background service management (systemd on Linux, launchd on macOS)
- No status check without grepping processes
- No subcommand extensibility for future ops commands

This spec introduces a proper CLI entry point with the following commands:

```
cueless start              # start in foreground (blocking)
cueless service install    # install as system service (systemd/launchd)
cueless service uninstall  # remove system service
cueless service start      # start background service
cueless service stop       # stop background service
cueless service restart    # restart background service
cueless service status     # show service status
cueless status             # show runtime status (process & config)
```

## Design

### Architecture

```
apps/api/src/
  cli.ts          ← NEW: CLI entry point (commander), bin: "cueless"
  index.ts        ← REFACTORED: exports startDaemon() function, no top-level side effects
  service/
    index.ts      ← NEW: service manager (systemd/launchd dispatch)
    systemd.ts    ← NEW: systemd unit file generation + install/uninstall/start/stop/status
    launchd.ts    ← NEW: launchd plist generation + install/uninstall/start/stop/status
```

### CLI Entry Point (`cli.ts`)

Uses `commander` to define subcommands:

- `start` / `daemon`: calls `startDaemon()` from `index.ts`, runs in foreground. SIGINT/SIGTERM handled inside.
- `service <subcommand>`: dispatches to the platform-appropriate service manager
- `status`: prints config summary and whether the process is running

### Service Manager

Auto-detects platform:
- **macOS**: launchd (`~/Library/LaunchAgents/ai.cueless.plist`)
- **Linux**: systemd user unit (`~/.config/systemd/user/cueless.service`)

Generated unit files reference the installed binary path (`which cueless` or `node dist/cli.js`).

### `index.ts` Refactor

Extract all top-level side-effect code into a `startDaemon()` async function that can be called by the `start` command. The file should export this function, not execute it directly.

## Plan

- [x] Add `commander` dependency to `apps/api`
- [x] Refactor `apps/api/src/index.ts`: wrap everything in `export async function startDaemon()`, no top-level execution
- [x] Create `apps/api/src/cli.ts`: CLI entry point with `start` and `service` subcommands
- [x] Create `apps/api/src/service/systemd.ts`: systemd user unit management
- [x] Create `apps/api/src/service/launchd.ts`: launchd plist management
- [x] Create `apps/api/src/service/index.ts`: platform auto-detect and dispatch
- [x] Update `apps/api/package.json`: add `bin` field pointing to `dist/src/cli.js`, update `start` script
- [x] Verify `cueless start` runs gateway in foreground (existing behavior)
- [x] Verify `cueless service install && cueless service start` works on macOS (launchd)
- [x] Verify `cueless status` prints config and process state
