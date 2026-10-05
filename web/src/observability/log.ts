/**
 * Structured logging (§7.7). The unit of debugging is always "what happened
 * to this trip?", so every line carries trip_id when one exists.
 */

type Level = "debug" | "info" | "warn" | "error";

export interface LogFields {
  tripId?: string | null;
  userId?: string | null;
  jobId?: string;
  jobType?: string;
  templateKey?: string;
  channel?: string;
  principal?: string;
  [k: string]: unknown;
}

function emit(level: Level, msg: string, fields: LogFields = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, f?: LogFields) => emit("debug", msg, f),
  info: (msg: string, f?: LogFields) => emit("info", msg, f),
  warn: (msg: string, f?: LogFields) => emit("warn", msg, f),
  error: (msg: string, f?: LogFields) => emit("error", msg, f),
};

/**
 * Error tracking hook. Wire Sentry (or equivalent) here; keeping the call
 * site singular means the swap is one file.
 */
export function captureException(err: unknown, fields: LogFields = {}) {
  const e = err instanceof Error ? err : new Error(String(err));
  emit("error", e.message, { ...fields, stack: e.stack });
}
