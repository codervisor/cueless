# Telegramable

Telegramable is a Telegram-first AI agent interface — ask your AI (Claude, Gemini, Copilot, etc.) to do things for you via instant messaging. It bridges the gap between mainstream IM experiences (like WeChat, Telegram) and AI coding agents, providing a single continuous conversation instead of fragmented multi-session interactions.

## Quick Start

1. Install dependencies (requires Node.js >= 22 and pnpm):

```bash
pnpm install
```

2. Configure environment variables:

```bash
cp .env.example .env
# Edit .env with your Telegram bot token and agent settings
```

3. Run in development:

```bash
pnpm dev
```

Or run only the CLI gateway:

```bash
pnpm --filter @telegramable/cli dev
```

## Project Structure

```
apps/
  cli/          # Gateway daemon (@telegramable/cli)
  web/          # Next.js frontend (@telegramable/web)
packages/
  core/         # Shared gateway, hub, and runtime library (@telegramable/core)
  tsconfig/     # Shared TypeScript config
  ui/           # Shared UI components
```

## Configuration

Set environment variables in `.env` or your deployment platform (Railway, Docker, etc.).

| Variable            | Default  | Description                        |
| ------------------- | -------- | ---------------------------------- |
| TELEGRAM_BOT_TOKEN  | -        | Telegram bot token (required)      |
| TELEGRAM_CHANNEL_ID | -        | Channel identifier (required)      |
| RUNTIME_COMMAND     | -        | Agent command (e.g., `copilot`)    |
| RUNTIME_WORKING_DIR | -        | Working directory for the agent    |
| RUNTIME_TIMEOUT_MS  | 600000   | Agent execution timeout in ms      |
| DEFAULT_AGENT       | default  | Default agent name                 |
| LOG_LEVEL           | info     | Log verbosity (`debug`, `info`, `warn`, `error`) |

Supported runtimes: `cli`, `session-claude`, `session-claude-sdk`, `session-gemini`, `session-copilot`.

Multi-channel and multi-agent setups will be managed via CLI commands (e.g., `telegramable channel add`, `telegramable agent add`) — see spec 018.

## Testing

```bash
# Run all tests
pnpm test

# Run end-to-end tests (mock adapter + mock runtime)
pnpm test:e2e
```

## Deployment

### Docker

```bash
docker build -t telegramable .
docker run --env-file .env -p 3000:3000 telegramable
```

Both the CLI gateway and the web frontend run in the same container. The web UI is available on port 3000.

### Railway

1. Create a new project on [Railway](https://railway.app) and connect the GitHub repo.
2. Railway picks up `railway.toml` automatically — no manual settings needed.
3. Add your environment variables (see [Configuration](#configuration) above).
4. Deploy.

Alternatively, use the Railway CLI:

```bash
railway login
railway link
railway up
```
