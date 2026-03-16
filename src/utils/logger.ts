import pino from 'pino';

// Define the logger configuration
// We use the browser-specific options so that in dev it logs nicely to the console,
// and in production it can be easily hooked up to a log aggregator if needed.
export const logger = pino({
  level: import.meta.env.DEV ? 'debug' : 'info',
  browser: {
    asObject: false
  }
});
