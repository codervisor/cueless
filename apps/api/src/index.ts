import { loadConfig } from "./config";
import { EventBus } from "./events/eventBus";
import { Gateway } from "./gateway/gateway";
import { TelegramAdapter } from "./gateway/telegramAdapter";
import { createLogger } from "./logging";
import { createRuntime } from "./runtime";

export async function startDaemon(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const eventBus = new EventBus();
  const runtime = createRuntime(config, logger);

  if (!config.telegramToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is required.");
  }

  const adapter = new TelegramAdapter(
    config.telegramToken,
    config.telegramPollingInterval,
    logger
  );

  const gateway = new Gateway(adapter, runtime, eventBus, logger);

  await gateway.start();

  const shutdown = async () => {
    logger.info("Shutting down...");
    await gateway.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
