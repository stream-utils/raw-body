/**
 * Adapt a mocha-style `done` callback test to a promise-returning
 * test, since vitest does not support callback-style tests.
 */
export function withDone (fn: (done: (err?: unknown) => void) => void): () => Promise<void> {
  return function run () {
    return new Promise(function executor (resolve, reject) {
      fn(function done (err) {
        if (err) reject(err)
        else resolve()
      })
    })
  }
}
