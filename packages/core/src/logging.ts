export type LogLevel = "debug" | "info" | "warn" | "error";

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export interface Logger {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

const formatMeta = (meta?: Record<string, unknown>): string => {
  if (!meta || Object.keys(meta).length === 0) {
    return "";
  }
  return ` ${JSON.stringify(meta)}`;
};

export const createLogger = (level: LogLevel): Logger => {
  const threshold = levelOrder[level];

  const log = (target: LogLevel, message: string, meta?: Record<string, unknown>) => {
    if (levelOrder[target] < threshold) {
      return;
    }
    const timestamp = new Date().toISOString();
    const output = `[${timestamp}] ${target.toUpperCase()} ${message}${formatMeta(meta)}`;
    if (target === "error") {
      console.error(output);
      return;
    }
    if (target === "warn") {
      console.warn(output);
      return;
    }
    console.log(output);
  };

  return {
    debug: (message, meta) => log("debug", message, meta),
    info: (message, meta) => log("info", message, meta),
    warn: (message, meta) => log("warn", message, meta),
    error: (message, meta) => log("error", message, meta)
  };
};
