import { config as dotenvConfig } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";

/**
 * Load environment variables from .env files in Next.js style:
 * 1. .env - default values
 * 2. .env.local - local overrides (not committed to git)
 */
export const loadEnv = (): void => {
  const rootDir = resolve(__dirname, "..");

  // Load .env first (default values)
  const envPath = resolve(rootDir, ".env");
  if (existsSync(envPath)) {
    dotenvConfig({ path: envPath });
  }

  // Load .env.local second (overrides .env)
  const envLocalPath = resolve(rootDir, ".env.local");
  if (existsSync(envLocalPath)) {
    dotenvConfig({ path: envLocalPath, override: true });
  }
};

export type RuntimeType = "mock" | "cli";
export type IMProvider = "telegram" | "mock";

export interface Config {
  imProvider: IMProvider;
  telegramToken?: string;
  telegramPollingInterval: number;
  runtimeType: RuntimeType;
  runtimeCommand?: string;
  runtimeWorkingDir?: string;
  runtimeTimeoutMs: number;
  logLevel: "debug" | "info" | "warn" | "error";
}

const parseLogLevel = (value?: string): Config["logLevel"] => {
  const normalized = (value || "info").toLowerCase();
  switch (normalized) {
    case "debug":
    case "info":
    case "warn":
    case "error":
      return normalized as Config["logLevel"];
    default:
      return "info";
  }
};

const parseRuntimeType = (value?: string): RuntimeType => {
  return value === "cli" ? "cli" : "mock";
};

const parseImProvider = (value?: string): IMProvider => {
  return value === "mock" ? "mock" : "telegram";
};

export const loadConfig = (): Config => {
  // Load .env files before accessing process.env
  loadEnv();

  const runtimeTimeoutMs = Number(process.env.RUNTIME_TIMEOUT_MS || 10 * 60 * 1000);
  const telegramPollingInterval = Number(process.env.TELEGRAM_POLLING_INTERVAL || 300);

  return {
    imProvider: parseImProvider(process.env.IM_PROVIDER),
    telegramToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramPollingInterval: Number.isFinite(telegramPollingInterval) ? telegramPollingInterval : 300,
    runtimeType: parseRuntimeType(process.env.RUNTIME_TYPE),
    runtimeCommand: process.env.RUNTIME_COMMAND,
    runtimeWorkingDir: process.env.RUNTIME_WORKING_DIR,
    runtimeTimeoutMs: Number.isFinite(runtimeTimeoutMs) ? runtimeTimeoutMs : 10 * 60 * 1000,
    logLevel: parseLogLevel(process.env.LOG_LEVEL)
  };
};
