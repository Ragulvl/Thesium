// server/config/logger.ts
// Structured console logger with ANSI colours.
// Supports: trace, debug, info, warn, error, fatal — matching pino's API surface
// so swapping to pino later requires only changing this file.

const C = {
  r: '\x1b[0m', dim: '\x1b[2m',
  red: '\x1b[31m', grn: '\x1b[32m', yel: '\x1b[33m', cyn: '\x1b[36m', gry: '\x1b[90m',
  mag: '\x1b[35m', bold: '\x1b[1m', bgRed: '\x1b[41m',
};

const time = () => {
  const d = new Date();
  return `${C.gry}${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}${C.r}`;
};

function formatMessage(dataOrMsg: any, msg?: string): string {
  if (typeof dataOrMsg === 'string') return dataOrMsg;
  if (msg) return msg;
  return JSON.stringify(dataOrMsg);
}

export const logger = {
  trace(_dataOrMsg: any, _msg?: string) { /* silent in this impl */ },

  debug(_dataOrMsg: any, _msg?: string) { /* silent in this impl */ },

  info(dataOrMsg: any, msg?: string) {
    console.log(`${time()} ${C.grn}✓${C.r} ${formatMessage(dataOrMsg, msg)}`);
  },

  warn(dataOrMsg: any, msg?: string) {
    console.warn(`${time()} ${C.yel}⚠${C.r} ${formatMessage(dataOrMsg, msg)}`);
  },

  error(dataOrMsg: any, msg?: string) {
    const text = formatMessage(dataOrMsg, msg);
    const errMsg = typeof dataOrMsg === 'object' ? (dataOrMsg?.err?.message || '') : '';
    console.error(
      `${time()} ${C.red}✗${C.r} ${C.red}${text}${C.r}${errMsg && text !== errMsg ? ` → ${errMsg}` : ''}`
    );
  },

  /** fatal: log and (optionally) crash the process */
  fatal(dataOrMsg: any, msg?: string) {
    const text = formatMessage(dataOrMsg, msg);
    const errMsg = typeof dataOrMsg === 'object' ? (dataOrMsg?.err?.message || '') : '';
    console.error(
      `${time()} ${C.bgRed}${C.bold}FATAL${C.r} ${C.red}${text}${C.r}${errMsg && text !== errMsg ? ` → ${errMsg}` : ''}`
    );
  },

  /** Returns the same logger (child loggers not yet supported) */
  child() { return logger; },
};

/**
 * Redact sensitive keys from an object before logging.
 * Usage: logger.info(safeLog(process.env), 'Current config')
 */
export function safeLog(obj: Record<string, any>): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    cleaned[k] = /KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL/i.test(k) ? '[REDACTED]' : v;
  }
  return cleaned;
}
