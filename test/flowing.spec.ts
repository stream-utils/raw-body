import assert from 'node:assert'
import { Readable, Writable } from 'node:stream'
import { describe, it } from 'vitest'
import getRawBody from '../src/index.ts'
import { withDone } from './support/with-done.ts'

const defaultLimit = 1024 * 1024

type TrackedStream = Readable & { wasPaused: boolean }
type TrackedWebStream = ReadableStream<Uint8Array> & { pulls: number }

describe('stream flowing', function () {
  describe('when limit lower then length', function () {
    it('should stop the steam flow', withDone(function (done) {
      const stream = createInfiniteStream()

      getRawBody(stream, {
        limit: defaultLimit,
        length: defaultLimit * 2
      }, function (err, body) {
        assert.ok(err)
        assert.strictEqual(err.type, 'entity.too.large')
        assert.strictEqual(err.message, 'request entity too large')
        assert.strictEqual(err.statusCode, 413)
        assert.strictEqual(err.length, defaultLimit * 2)
        assert.strictEqual(err.limit, defaultLimit)
        assert.strictEqual(body, undefined)
        assert.ok(stream.wasPaused)

        done()
      })
    }))

    it('should halt flowing stream', withDone(function (done) {
      const stream = createInfiniteStream(true)
      const dest = createBlackholeStream()

      // pipe the stream
      stream.pipe(dest)

      getRawBody(stream, {
        limit: defaultLimit * 2,
        length: defaultLimit
      }, function (err, body) {
        assert.ok(err)
        assert.strictEqual(err.type, 'entity.too.large')
        assert.strictEqual(err.message, 'request entity too large')
        assert.strictEqual(err.statusCode, 413)
        assert.strictEqual(body, undefined)
        assert.ok(stream.wasPaused)
        done()
      })
    }))
  })

  describe('when stream has encoding set', function () {
    it('should stop the steam flow', withDone(function (done) {
      const stream = createInfiniteStream()
      stream.setEncoding('utf8')

      getRawBody(stream, {
        limit: defaultLimit
      }, function (err) {
        assert.ok(err)
        assert.strictEqual(err.type, 'stream.encoding.set')
        assert.strictEqual(err.message, 'stream encoding should not be set')
        assert.strictEqual(err.statusCode, 500)
        assert.ok(stream.wasPaused)

        done()
      })
    }))
  })

  describe('when stream has limit', function () {
    it('should stop the steam flow', withDone(function (done) {
      const stream = createInfiniteStream()

      getRawBody(stream, {
        limit: defaultLimit
      }, function (err) {
        assert.ok(err)
        assert.strictEqual(err.type, 'entity.too.large')
        assert.strictEqual(err.statusCode, 413)
        assert.ok(err.received! > defaultLimit)
        assert.strictEqual(err.limit, defaultLimit)
        assert.ok(stream.wasPaused)

        done()
      })
    }))
  })

  describe('when stream errors', function () {
    it('should stop the steam flow', withDone(function (done) {
      const stream = createInfiniteStream()

      getRawBody(stream, function (err) {
        assert.ok(err)
        assert.strictEqual(err.message, 'BOOM')
        assert.ok(stream.wasPaused)

        done()
      })

      setTimeout(function () {
        stream.emit('error', new Error('BOOM'))
      }, 500)
    }))
  })

  describe('when a web stream exceeds the limit', function () {
    it('should stop pulling', withDone(function (done) {
      const stream = createInfiniteWebStream()

      getRawBody(stream, {
        limit: defaultLimit
      }, function (err) {
        assert.ok(err)
        assert.strictEqual(err.type, 'entity.too.large')
        assert.ok(err.received! > defaultLimit)
        assert.strictEqual(stream.locked, false)

        assertPullsSettle(stream, done)
      })
    }))

    it('should not pull when length exceeds limit', withDone(function (done) {
      const stream = createInfiniteWebStream()

      getRawBody(stream, {
        length: defaultLimit * 2,
        limit: defaultLimit
      }, function (err) {
        assert.ok(err)
        assert.strictEqual(err.type, 'entity.too.large')
        assert.strictEqual(stream.locked, false)

        // never read: only the stream's own queue priming runs
        assert.ok(stream.pulls <= 1)
        assertPullsSettle(stream, done)
      })
    }))
  })
})

/**
 * The web analogue of asserting a paused stream: after the
 * queue refills to its high water mark, pulls stop growing.
 */

function assertPullsSettle (stream: TrackedWebStream, done: () => void): void {
  setTimeout(function () {
    const settled = stream.pulls

    setTimeout(function () {
      assert.strictEqual(stream.pulls, settled)
      done()
    }, 100)
  }, 100)
}

function createInfiniteWebStream (): TrackedWebStream {
  let pulls = 0

  const stream = new ReadableStream({
    pull (controller) {
      pulls++
      controller.enqueue(new Uint8Array(64 * 1024))
    }
  })

  // track pull count for tests
  Object.defineProperty(stream, 'pulls', {
    get () { return pulls }
  })

  return stream as TrackedWebStream
}

function createChunk (): string {
  const base = Math.random().toString(32)
  const KB_4 = 32 * 4
  const KB_8 = KB_4 * 2
  const KB_16 = KB_8 * 2
  const KB_64 = KB_16 * 4

  const rand = Math.random()
  if (rand < 0.25) {
    return repeat(base, KB_4)
  } else if (rand < 0.5) {
    return repeat(base, KB_8)
  } else if (rand < 0.75) {
    return repeat(base, KB_16)
  } else {
    return repeat(base, KB_64)
  }

  function repeat (str: string, num: number): string {
    return new Array(num + 1).join(str)
  }
}

function createBlackholeStream (): Writable {
  const stream = new Writable()
  stream._write = function (chunk, encoding, cb) {
    cb()
  }

  return stream
}

function createInfiniteStream (paused?: boolean): TrackedStream {
  const stream = new Readable() as TrackedStream
  stream._read = function () {
    const rand = 2 + Math.floor(Math.random() * 10)

    setTimeout(function () {
      for (let i = 0; i < rand; i++) {
        stream.push(createChunk())
      }
    }, 100)
  }

  // track paused state for tests
  stream.wasPaused = false
  stream.on('pause', function (this: TrackedStream) { this.wasPaused = true })
  stream.on('resume', function (this: TrackedStream) { this.wasPaused = false })

  // immediately put the stream in flowing mode
  if (!paused) {
    stream.resume()
  }

  return stream
}
