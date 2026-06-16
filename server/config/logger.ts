// Ultra-minimal logger — one clean line per event.

const C = {
  r: '\x1b[0m', dim: '\x1b[2m',
  red: '\x1b[31m', grn: '\x1b[32m', yel: '\x1b[33m', cyn: '\x1b[36m', gry: '\x1b[90m',
  mag: '\x1b[35m', bold: '\x1b[1m',
};

const time = () => {
  const d = new Date();
  return `${C.gry}${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}${C.r}`;
};

export const logger = {
  info(dataOrMsg: any, msg?: string) {
    const text = typeof dataOrMsg === 'string' ? dataOrMsg : (msg || '');
    console.log(`${time()} ${C.grn}✓${C.r} ${text}`);
  },

  warn(dataOrMsg: any, msg?: string) {
    const text = typeof dataOrMsg === 'string' ? dataOrMsg : (msg || '');
    console.log(`${time()} ${C.yel}⚠${C.r} ${text}`);
  },

  error(dataOrMsg: any, msg?: string) {
    if (typeof dataOrMsg === 'string') {
      console.log(`${time()} ${C.red}✗${C.r} ${C.red}${dataOrMsg}${C.r}`);
    } else {
      const errMsg = dataOrMsg?.err?.message || '';
      const text = msg || '';
      console.log(`${time()} ${C.red}✗${C.r} ${C.red}${text}${C.r}${errMsg ? ` → ${errMsg}` : ''}`);
    }
  },

  debug(_dataOrMsg: any, _msg?: string) { /* silent */ },

  child() { return logger; },
};

export function safeLog(obj: Record<string, any>): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    cleaned[k] = /KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL/i.test(k) ? '[REDACTED]' : v;
  }
  return cleaned;
}
