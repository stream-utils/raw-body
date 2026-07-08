/**
 * Runtime detection for skipping tests that exercise Node.js-specific
 * behavior not implemented by other runtimes.
 */

export const isBun = typeof process.versions.bun === 'string'
