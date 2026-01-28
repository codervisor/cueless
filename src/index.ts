import { loadConfig } from "./config";
import { EventBus } from "./events/eventBus";
import { Gateway } from "./gateway/gateway";
import { MockAdapter } from "./gateway/mockAdapter";
import { TelegramAdapter } from "./gateway/telegramAdapter";
import { createLogger } from "./logging";
import { createRuntime } from "./runtime";

const config = loadConfig();
const logger = createLogger(config.logLevel);
const eventBus = new EventBus();
const runtime = createRuntime(config, logger);

const adapter = config.imProvider === "mock"
  ? new MockAdapter()
  : new TelegramAdapter(config.telegramToken || "", logger);

if (config.imProvider === "telegram" && !config.telegramToken) {
  throw new Error("TELEGRAM_BOT_TOKEN is required when IM_PROVIDER=telegram.");
}

const gateway = new Gateway(adapter, runtime, eventBus, logger);

void gateway.start();

const shutdown = async () => {
  logger.info("Shutting down...");
  await gateway.stop();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
