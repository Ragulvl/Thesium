// Why: validateEnv is now consolidated inside server/config/env.ts.
// This file re-exports it for backward compatibility.
// The old manual loop and logger.fatal call have been removed.
export { validateEnv } from './env.js';
