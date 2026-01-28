export type RuntimeType = "mock" | "cli";
export type IMProvider = "telegram" | "mock";

export interface Config {
  imProvider: IMProvider;
  telegramToken?: string;
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
  const runtimeTimeoutMs = Number(process.env.RUNTIME_TIMEOUT_MS || 10 * 60 * 1000);

  return {
    imProvider: parseImProvider(process.env.IM_PROVIDER),
    telegramToken: process.env.TELEGRAM_BOT_TOKEN,
    runtimeType: parseRuntimeType(process.env.RUNTIME_TYPE),
    runtimeCommand: process.env.RUNTIME_COMMAND,
    runtimeWorkingDir: process.env.RUNTIME_WORKING_DIR,
    runtimeTimeoutMs: Number.isFinite(runtimeTimeoutMs) ? runtimeTimeoutMs : 10 * 60 * 1000,
    logLevel: parseLogLevel(process.env.LOG_LEVEL)
  };
};
