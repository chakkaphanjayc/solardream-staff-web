export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEvent = {
  level: LogLevel;
  scope: string;
  message: string;
  context?: Record<string, unknown>;
};

export function createLogger(scope: string) {
  const write = (level: LogLevel, message: string, context?: Record<string, unknown>) => {
    const event: LogEvent = { level, scope, message, ...(context ? { context } : {}) };
    const serialized = JSON.stringify(event);

    if (level === "error") console.error(serialized);
    else if (level === "warn") console.warn(serialized);
    else console.log(serialized);
  };

  return {
    debug: (message: string, context?: Record<string, unknown>) => write("debug", message, context),
    info: (message: string, context?: Record<string, unknown>) => write("info", message, context),
    warn: (message: string, context?: Record<string, unknown>) => write("warn", message, context),
    error: (message: string, context?: Record<string, unknown>) => write("error", message, context),
  };
}
