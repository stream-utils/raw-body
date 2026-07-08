/**
 * Runtime detection for skipping tests that exercise Node.js-specific
 * behavior not implemented by other runtimes.
 */

export const isBun = typeof process.versions.bun === 'string'

export const isDeno = typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined'

/**
 * `Readable.isDisturbed` only recognizes web streams created by Node.js
 * itself, so cancelled/consumed streams cannot be detected on Bun or Deno.
 */
export const hasIsDisturbed = !isBun && !isDeno
