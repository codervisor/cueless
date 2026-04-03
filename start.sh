#!/bin/bash

# ── Fix volume permissions as root, then drop to the claude user ────────────
# Railway (and Docker) volumes mount as root, overriding the Dockerfile's chown.
# A non-root user cannot chown a root-owned directory, so we must fix permissions
# while still running as root, then re-exec this script as the `claude` user.
if [ "$(id -u)" = "0" ]; then
  # Detect whether /data is an actual mount point (volume)
  _data_is_volume() {
    { command -v mountpoint >/dev/null 2>&1 && mountpoint -q /data; } ||
      grep -qE ' /data(/| )' /proc/self/mountinfo 2>/dev/null
  }

  if _data_is_volume; then
    echo "[telegramable] Fixing /data volume permissions for claude user..."
    chown -R claude:claude /data 2>/dev/null || true
  fi

  # Re-exec this script as the claude user (continues below)
  exec gosu claude "$0"
fi

# ── Everything below runs as the `claude` user ──────────────────────────────

# ── Persist Claude Code sessions across container restarts ──────────────────
# Claude Code stores conversation history and session data in ~/.claude.
# When a Railway Volume (or Docker volume) is mounted at /data, we symlink
# ~/.claude → /data/.claude so that session data survives redeploys.
CLAUDE_HOME="${HOME}/.claude"
PERSIST_DIR="/data/.claude"

# Detect whether /data is an actual mount point (volume), not just the empty
# directory created by the Dockerfile.  Try `mountpoint` first, fall back to
# /proc/self/mountinfo for minimal images that lack the util.
data_is_volume() {
  { command -v mountpoint >/dev/null 2>&1 && mountpoint -q /data; } ||
    grep -qE ' /data(/| )' /proc/self/mountinfo 2>/dev/null
}

if data_is_volume; then
  # Ensure the persistent directory exists (should succeed now that root fixed ownership)
  if ! mkdir -p "$PERSIST_DIR" 2>/dev/null; then
    echo "[telegramable] WARNING: Cannot create $PERSIST_DIR — Claude Code sessions will be ephemeral"
  else
    # If ~/.claude already exists (from the install step) and is NOT a symlink,
    # seed the persistent dir with any existing content, then replace with symlink.
    if [ -e "$CLAUDE_HOME" ] && [ ! -L "$CLAUDE_HOME" ]; then
      cp -a "$CLAUDE_HOME/." "$PERSIST_DIR/" 2>/dev/null || true
      rm -rf "$CLAUDE_HOME"
    fi

    # Create the symlink (idempotent — remove stale entry first)
    if [ -e "$CLAUDE_HOME" ] || [ -L "$CLAUDE_HOME" ]; then
      rm -rf "$CLAUDE_HOME"
    fi
    ln -s "$PERSIST_DIR" "$CLAUDE_HOME"
    echo "[telegramable] Claude Code sessions will persist at $PERSIST_DIR"
  fi
else
  echo "[telegramable] No /data volume detected — Claude Code sessions will be ephemeral"
fi

# ── Seed project context files into /data ──────────────────────────────────
# Claude Code needs CLAUDE.md, AGENTS.md, and skill docs in its working
# directory (/data) to have project context. Copy from the image if they
# don't already exist (preserves user customizations on the volume).
CONTEXT_DIR="/app/context"
if [ -d "$CONTEXT_DIR" ]; then
  for f in CLAUDE.md AGENTS.md; do
    if [ -f "$CONTEXT_DIR/$f" ] && [ ! -f "/data/$f" ]; then
      cp "$CONTEXT_DIR/$f" "/data/$f"
      echo "[telegramable] Seeded /data/$f"
    fi
  done
  if [ -d "$CONTEXT_DIR/.github/skills" ] && [ ! -d "/data/.github/skills" ]; then
    mkdir -p /data/.github
    cp -r "$CONTEXT_DIR/.github/skills" /data/.github/skills
    echo "[telegramable] Seeded /data/.github/skills/"
  fi
fi

# Start web server
node /app/web/apps/web/server.js &
WEB_PID=$!

# Start CLI process
node /app/cli/dist/cli.js start &
CLI_PID=$!

terminate() {
  kill "$WEB_PID" "$CLI_PID" 2>/dev/null || true
}

on_signal() {
  terminate
  wait "$WEB_PID" "$CLI_PID" 2>/dev/null
  exit 143
}

trap 'on_signal' INT TERM

# Wait for the first process to exit
if ! wait -n "$WEB_PID" "$CLI_PID"; then
  status=$?
  terminate
  wait "$WEB_PID" "$CLI_PID" 2>/dev/null
  exit "$status"
fi

# First process exited successfully; wait for the remaining one
wait "$WEB_PID" "$CLI_PID"
exit $?
