const isDev = process.env.NODE_ENV === "development";
const logLevel = process.env.LOG_LEVEL ?? (isDev ? "debug" : "error");

type LogLevel = "debug" | "info" | "warn" | "error";

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return levels[level] >= levels[logLevel as LogLevel] ?? levels.error;
}

export const logger = {
  debug: (context: string, ...args: unknown[]) => {
    if (shouldLog("debug")) {
      console.log(`[debug:${context}]`, ...args);
    }
  },
  info: (context: string, ...args: unknown[]) => {
    if (shouldLog("info")) {
      console.info(`[info:${context}]`, ...args);
    }
  },
  warn: (context: string, ...args: unknown[]) => {
    if (shouldLog("warn")) {
      console.warn(`[warn:${context}]`, ...args);
    }
  },
  error: (context: string, ...args: unknown[]) => {
    if (shouldLog("error")) {
      console.error(`[error:${context}]`, ...args);
    }
  },
};
