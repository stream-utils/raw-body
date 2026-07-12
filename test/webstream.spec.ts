import assert from 'node:assert'
import http from 'node:http'
import net from 'node:net'
import { Readable } from 'node:stream'
import type { ReadableWritablePair } from 'node:stream/web'
import iconv from 'iconv-lite'
import { describe, it } from 'vitest'
import { getRawBodyWeb, type RawBodyError } from '../src/index.ts'
import { isBun } from './support/runtime.ts'
import { withDone } from './support/with-done.ts'

describe('using web streams', function () {
  it('should validate stream', function () {
    // @ts-expect-error missing stream argument
    assert.throws(function () { getRawBodyWeb() }, /argument stream is required/)
    // @ts-expect-error invalid stream argument
    assert.throws(function () { getRawBodyWeb(null) }, /argument stream must be a web ReadableStream/)
    // @ts-expect-error invalid stream argument
    assert.throws(function () { getRawBodyWeb(42) }, /argument stream must be a web ReadableStream/)
    // @ts-expect-error invalid stream argument
    assert.throws(function () { getRawBodyWeb({}) }, /argument stream must be a web ReadableStream/)
    // a node stream belongs to getRawBody
    // @ts-expect-error invalid stream argument
    assert.throws(function () { getRawBodyWeb(new Readable()) }, /argument stream must be a web ReadableStream/)
  })

  it('should read a ReadableStream into a buffer', async function () {
    const buf = await getRawBodyWeb(createWebStream(['hello', ', ', 'world!']))
    assert.ok(Buffer.isBuffer(buf))
    assert.strictEqual(buf.toString(), 'hello, world!')
  })

  it('should read an empty ReadableStream', async function () {
    const buf = await getRawBodyWeb(createWebStream([]))
    assert.ok(Buffer.isBuffer(buf))
    assert.strictEqual(buf.length, 0)
  })

  it('should work with encoding', async function () {
    const str = await getRawBodyWeb(createWebStream(['hello, world!']), {
      encoding: 'utf-8'
    })
    assert.strictEqual(str, 'hello, world!')
  })

  it('should work with `true` as an option', async function () {
    const str = await getRawBodyWeb(createWebStream(['hello, world!']), true)
    assert.strictEqual(str, 'hello, world!')
  })

  it('should decode multi-byte characters split across chunks', async function () {
    const bytes = Buffer.from('é€好', 'utf-8')
    const str = await getRawBodyWeb(createWebStream([
      bytes.subarray(0, 3),
      bytes.subarray(3)
    ]), {
      encoding: 'utf-8'
    })
    assert.strictEqual(str, 'é€好')
  })

  it('should work with string chunks', async function () {
    const buf = await getRawBodyWeb(createWebStream(['hello', ', world!'], { binary: false }))
    assert.ok(Buffer.isBuffer(buf))
    assert.strictEqual(buf.toString(), 'hello, world!')
  })

  it('should read a TextDecoderStream as a utf-8 Buffer', async function () {
    // TextDecoderStream emits already-decoded string chunks; getRawBodyWeb
    // re-encodes them to utf-8. multi-byte characters split across the
    // underlying byte chunks must survive the round trip.
    const bytes = Buffer.from('café ☕ 好', 'utf-8')

    const byteStream = new ReadableStream<NodeJS.BufferSource>({
      start (controller) {
        for (let i = 0; i < bytes.length; i += 2) {
          controller.enqueue(bytes.subarray(i, i + 2))
        }
        controller.close()
      }
    })

    const stream = byteStream.pipeThrough(new TextDecoderStream())
    const buf = await getRawBodyWeb(stream)

    assert.ok(Buffer.isBuffer(buf))
    assert.strictEqual(buf.toString('utf-8'), 'café ☕ 好')
  })

  it('should error on string chunks when encoding is set', async function () {
    // an already-decoded stream, e.g. piped through TextDecoderStream;
    // re-decoding it with the declared encoding would corrupt the data
    const stream = createWebStream(['hello, world!'], { binary: false })

    await assert.rejects(getRawBodyWeb(stream, { encoding: 'utf-16le' }), function (err: RawBodyError) {
      assert.strictEqual(err.status, 500)
      assert.strictEqual(err.type, 'stream.encoding.set')
      return true
    })

    assert.strictEqual(stream.locked, false)
  })

  it('should work with a custom decoder', async function () {
    const str = await getRawBodyWeb(createWebStream([Buffer.from('636f6f6c20f09f9880', 'hex')]), {
      encoding: 'utf-8',
      decoder: iconv.getDecoder.bind(iconv)
    })
    assert.strictEqual(str, 'cool 😀')
  })

  it('should decode encodings unsupported by TextDecoder', async function () {
    const bytes = iconv.encode('¿Cómo estás?', 'utf-32le')

    // split mid-character: each utf-32 code unit is 4 bytes,
    // so the decoder must carry state across chunks
    const str = await getRawBodyWeb(createWebStream([
      bytes.subarray(0, 6),
      bytes.subarray(6)
    ]), {
      encoding: 'utf-32le',
      decoder: iconv.getDecoder.bind(iconv)
    })

    assert.strictEqual(str, '¿Cómo estás?')
  })

  it('should work with the callback style', withDone(function (done) {
    getRawBodyWeb(createWebStream(['hello, world!']), function (err, buf) {
      assert.ifError(err)
      assert.strictEqual(buf.toString(), 'hello, world!')
      done()
    })
  }))

  it('should check length', async function () {
    const buf = await getRawBodyWeb(createWebStream(['hello, world!']), {
      length: 13
    })
    assert.strictEqual(buf.toString(), 'hello, world!')
  })

  it('should error with length mismatch', async function () {
    await assert.rejects(getRawBodyWeb(createWebStream(['hello, world!']), {
      length: 10
    }), function (err: RawBodyError) {
      assert.strictEqual(err.status, 400)
      assert.strictEqual(err.type, 'request.size.invalid')
      assert.strictEqual(err.expected, 10)
      assert.strictEqual(err.received, 13)
      return true
    })
  })

  it('should error when limit is exceeded', async function () {
    await assert.rejects(getRawBodyWeb(createWebStream(['hello, world!']), {
      limit: 5
    }), function (err: RawBodyError) {
      assert.strictEqual(err.status, 413)
      assert.strictEqual(err.type, 'entity.too.large')
      assert.strictEqual(err.limit, 5)
      return true
    })
  })

  it('should error early when length > limit', async function () {
    const stream = createWebStream(['hello, world!'])

    await assert.rejects(getRawBodyWeb(stream, {
      length: 13,
      limit: 5
    }), function (err: RawBodyError) {
      assert.strictEqual(err.status, 413)
      assert.strictEqual(err.type, 'entity.too.large')
      return true
    })

    // the stream was never locked, so it is still usable
    assert.strictEqual(stream.locked, false)
  })

  it('should error for an unsupported encoding', async function () {
    await assert.rejects(getRawBodyWeb(createWebStream(['hello, world!']), {
      encoding: 'foo/bar'
    }), function (err: RawBodyError) {
      assert.strictEqual(err.status, 415)
      assert.strictEqual(err.type, 'encoding.unsupported')
      return true
    })
  })

  it('should error when the stream is locked', async function () {
    const stream = createWebStream(['hello, world!'])
    const reader = stream.getReader()

    await assert.rejects(getRawBodyWeb(stream), function (err: RawBodyError) {
      assert.strictEqual(err.status, 500)
      assert.strictEqual(err.type, 'stream.not.readable')
      return true
    })

    reader.releaseLock()
  })

  it('should error when the body was already consumed', async function () {
    const res = new Response('hello, world!')
    await res.text()

    await assert.rejects(getRawBodyWeb(res.body!), function (err: RawBodyError) {
      assert.strictEqual(err.status, 500)
      assert.strictEqual(err.type, 'stream.not.readable')
      return true
    })
  })

  it('should error when the stream is locked by a pipe', async function () {
    const stream = createWebStream(['hello, world!'])
    const piped = stream.pipeThrough(new TextDecoderStream() as ReadableWritablePair<string, Uint8Array | string>)

    await assert.rejects(getRawBodyWeb(stream), function (err: RawBodyError) {
      assert.strictEqual(err.status, 500)
      assert.strictEqual(err.type, 'stream.not.readable')
      return true
    })

    await piped.cancel()
  })

  // a disturbed stream cannot be told apart from an empty one portably,
  // so cancelled and fully-read streams read as an empty body
  it('should read a cancelled stream as an empty body', async function () {
    const stream = createWebStream(['hello, world!'])
    await stream.cancel()

    const buf = await getRawBodyWeb(stream)
    assert.ok(Buffer.isBuffer(buf))
    assert.strictEqual(buf.length, 0)
  })

  it('should read an already-read stream as an empty body', async function () {
    const stream = createWebStream(['hello, world!'])
    const reader = stream.getReader()
    while (!(await reader.read()).done);
    reader.releaseLock()

    const buf = await getRawBodyWeb(stream)
    assert.ok(Buffer.isBuffer(buf))
    assert.strictEqual(buf.length, 0)
  })

  it('should map aborts to request.aborted', async function () {
    // deliver one chunk, then abort: erroring in start() would
    // discard the queued chunk, so error on the second pull
    let pulls = 0
    const stream = new ReadableStream<Uint8Array>({
      pull (controller) {
        if (pulls++ === 0) {
          controller.enqueue(new TextEncoder().encode('hel'))
        } else {
          controller.error(new DOMException('This operation was aborted', 'AbortError'))
        }
      }
    })

    await assert.rejects(getRawBodyWeb(stream, { length: 10 }), function (err: RawBodyError) {
      assert.strictEqual(err.status, 400)
      assert.strictEqual(err.type, 'request.aborted')
      assert.strictEqual(err.code, 'ECONNABORTED')
      assert.strictEqual(err.expected, 10)
      assert.strictEqual(err.received, 3)
      return true
    })
  })

  // Bun's Readable.toWeb does not surface premature-close errors from sockets
  it.skipIf(isBun)('should map aborts from Readable.toWeb request streams', withDone(function (done) {
    let clientRequest: http.ClientRequest

    const server = http.createServer(function (req, res) {
      getRawBodyWeb(Readable.toWeb(req), {
        length: req.headers['content-length'],
        limit: '1kb'
      }, function (err) {
        res.destroy()
        server.close()

        assert.ok(err)
        assert.strictEqual(err.status, 400)
        assert.strictEqual(err.type, 'request.aborted')
        assert.strictEqual(err.code, 'ECONNABORTED')
        assert.ok(err.cause)
        done()
      })

      setTimeout(function () { clientRequest.destroy() }, 10)
    })

    server.listen(0, function () {
      clientRequest = http.request({
        port: (server.address() as net.AddressInfo).port,
        method: 'POST',
        headers: { 'content-length': '100' }
      })

      clientRequest.on('error', function () {}) // socket hang up
      clientRequest.write('partial')
    })
  }))

  // Bun's Readable.toWeb does not propagate socket reset errors
  it.skipIf(isBun)('should pass through a live socket reset unmapped', withDone(function (done) {
    const server = net.createServer(function (socket) {
      socket.write('partial')
      setTimeout(function () { socket.resetAndDestroy() }, 10)
    })

    server.listen(0, function () {
      const socket = net.connect((server.address() as net.AddressInfo).port)

      socket.on('connect', function () {
        getRawBodyWeb(Readable.toWeb(socket), function (err) {
          server.close()

          assert.ok(err)
          assert.strictEqual(err.code, 'ECONNRESET')
          assert.strictEqual(err.message, 'read ECONNRESET')
          assert.notStrictEqual(err.type, 'request.aborted')
          done()
        })
      })
    })
  }))

  it('should map destroyed Readable.toWeb streams to request.aborted', withDone(function (done) {
    const nodeStream = new Readable({ read () {} })
    const webStream = Readable.toWeb(nodeStream)

    getRawBodyWeb(webStream, function (err) {
      assert.ok(err)
      assert.strictEqual(err.status, 400)
      assert.strictEqual(err.type, 'request.aborted')
      assert.strictEqual(err.received, 7)
      done()
    })

    nodeStream.push(Buffer.from('partial'))
    setTimeout(function () { nodeStream.destroy() }, 10)
  }))

  it('should propagate stream errors', async function () {
    const stream = new ReadableStream<Uint8Array>({
      start (controller) {
        controller.enqueue(new TextEncoder().encode('hello'))
        controller.error(new Error('boom'))
      }
    })

    await assert.rejects(getRawBodyWeb(stream), /boom/)
  })

  it('should error when the decoder throws while writing', async function () {
    const stream = createWebStream(['hello, world!'])

    await assert.rejects(getRawBodyWeb(stream, {
      encoding: 'utf-8',
      decoder: function () {
        return {
          write () { throw new Error('decoder write failed') },
          end () { return '' }
        }
      }
    }), /decoder write failed/)

    // the lock is released, so the rest of the stream can be handled
    assert.strictEqual(stream.locked, false)
    await stream.cancel()
  })

  it('should error when the decoder throws at the end', async function () {
    const stream = createWebStream(['hello, world!'])

    await assert.rejects(getRawBodyWeb(stream, {
      encoding: 'utf-8',
      decoder: function () {
        return {
          write () { return '' },
          end () { throw new Error('decoder end failed') }
        }
      }
    }), /decoder end failed/)

    assert.strictEqual(stream.locked, false)
  })

  it('should normalize non-Error stream failures', async function () {
    // e.g. controller.error('timeout') or abort(reason) with a
    // string: callers must always receive an Error instance
    const stream = new ReadableStream<Uint8Array>({
      start (controller) {
        controller.error('timeout')
      }
    })

    await assert.rejects(getRawBodyWeb(stream), function (err: Error) {
      assert.ok(err instanceof Error)
      assert.strictEqual(err.message, 'stream error')
      assert.strictEqual(err.cause, 'timeout')
      return true
    })
  })

  it('should reject when the stream errors without a reason', async function () {
    const stream = new ReadableStream<Uint8Array>({
      start (controller) {
        controller.error()
      }
    })

    await assert.rejects(getRawBodyWeb(stream), /stream error/)
  })

  it('should error when the stream yields an invalid chunk', async function () {
    const stream = new ReadableStream({
      start (controller) {
        controller.enqueue(undefined)
        controller.close()
      }
    })

    await assert.rejects(getRawBodyWeb(stream), TypeError)

    // the lock is released, so the rest of the stream can be handled
    assert.strictEqual(stream.locked, false)
  })

  it('should error when the stream yields non-byte chunks', async function () {
    // an ArrayBuffer has no .length, which previously poisoned
    // the limit accounting with NaN, disabling the limit
    const stream = new ReadableStream({
      start (controller) {
        controller.enqueue(new ArrayBuffer(10))
        controller.close()
      }
    })

    await assert.rejects(getRawBodyWeb(stream, { limit: 5 }), /Uint8Array or string/)
    assert.strictEqual(stream.locked, false)
  })

  it('should assemble a large multi-chunk body', async function () {
    const chunk = Buffer.alloc(768 * 1024, 0x61)
    const big = Buffer.concat([chunk, chunk])

    const buf = await getRawBodyWeb(createWebStream([chunk, chunk]), { length: big.length })
    assert.strictEqual(buf.length, big.length)
    assert.ok(buf.equals(big))
  })

  it('should release the lock when finished', async function () {
    const stream = createWebStream(['hello, world!'])
    await getRawBodyWeb(stream)
    assert.strictEqual(stream.locked, false)
  })

  it('should read the body of a fetch Response', async function () {
    const res = new Response('hello, world!')
    const str = await getRawBodyWeb(res.body!, {
      encoding: 'utf-8',
      limit: '1kb'
    })
    assert.strictEqual(str, 'hello, world!')
  })

  it('should read the stream of a Blob', async function () {
    const blob = new Blob(['hello, world!'])
    const str = await getRawBodyWeb(blob.stream(), {
      encoding: 'utf-8'
    })
    assert.strictEqual(str, 'hello, world!')
  })

  it('should read the body of a fetch Request', async function () {
    const req = new Request('http://localhost/', {
      method: 'POST',
      body: 'hello, world!'
    })
    const str = await getRawBodyWeb(req.body!, {
      encoding: 'utf-8'
    })
    assert.strictEqual(str, 'hello, world!')
  })

  it('should map an aborted fetch Response body to request.aborted', async function () {
    // a fetch response cut off by an AbortController mid-body: the fetch
    // spec errors the body stream with the abort reason (an AbortError)
    const server = http.createServer(function (req, res) {
      res.writeHead(200, { 'content-length': '100' })
      res.write('partial')
      // never end: the client aborts first
    })

    await new Promise<void>(function (resolve) { server.listen(0, function () { resolve() }) })

    try {
      const controller = new AbortController()
      const res = await fetch('http://localhost:' + (server.address() as net.AddressInfo).port, {
        signal: controller.signal
      })

      setTimeout(function () { controller.abort() }, 20)

      await assert.rejects(getRawBodyWeb(res.body!, { length: 100 }), function (err: RawBodyError) {
        assert.strictEqual(err.status, 400)
        assert.strictEqual(err.type, 'request.aborted')
        assert.strictEqual(err.code, 'ECONNABORTED')
        assert.strictEqual(err.expected, 100)
        assert.strictEqual(err.received, 7)
        assert.ok(err.cause)
        return true
      })
    } finally {
      server.close()
    }
  })

  it('should read the readable side of a TransformStream', async function () {
    const gzipped = await getRawBodyWeb(
      new Blob(['hello, world!']).stream().pipeThrough(new CompressionStream('gzip'))
    )
    const str = await getRawBodyWeb(
      new Blob([new Uint8Array(gzipped)]).stream().pipeThrough(new DecompressionStream('gzip')),
      { encoding: 'utf-8' }
    )
    assert.strictEqual(str, 'hello, world!')
  })

  it('should not invoke the callback synchronously on early errors', withDone(function (done) {
    let returned = false

    getRawBodyWeb(createWebStream(['hello, world!']), {
      length: 13,
      limit: 5
    }, function (err) {
      assert.strictEqual(returned, true)
      assert.ok(err)
      assert.strictEqual(err.type, 'entity.too.large')
      done()
    })

    returned = true
  }))

  // Bun's test runner intercepts the throw before it reaches unhandledRejection
  it.skipIf(isBun)('should not catch or re-invoke a callback that throws', async function () {
    // take over unhandled rejections for this test, so the runner's
    // own handler does not fail the test for the expected one
    const listeners = process.listeners('unhandledRejection')
    process.removeAllListeners('unhandledRejection')

    let calls = 0
    let timer: NodeJS.Timeout | undefined
    const failure = new Error('callback bug')

    try {
      const caught = new Promise(function (resolve, reject) {
        process.once('unhandledRejection', resolve)
        timer = setTimeout(reject, 1000, new Error('expected an unhandled rejection'))
      })

      getRawBodyWeb(createWebStream(['hello, world!']), function () {
        calls++
        throw failure
      })

      // the throw must surface as an unhandled rejection with
      // the original error — not be misread as a stream error
      // and invoke the callback again
      assert.strictEqual(await caught, failure)
      assert.strictEqual(calls, 1)
    } finally {
      // restore the runner's handlers no matter how the test ends
      clearTimeout(timer)
      process.removeAllListeners('unhandledRejection')

      for (const listener of listeners) {
        process.on('unhandledRejection', listener)
      }
    }
  })

  it('should release the lock on error', async function () {
    const stream = createWebStream(['hello', ', world!'])

    await assert.rejects(getRawBodyWeb(stream, { limit: 3 }))

    // the lock is released, so the rest of the stream can be handled
    assert.strictEqual(stream.locked, false)
    await stream.cancel()
  })
})

function createWebStream (chunks: Array<string | Uint8Array>, options?: { binary?: boolean }): ReadableStream<Uint8Array | string> {
  const binary = !options || options.binary !== false

  return new ReadableStream<Uint8Array | string>({
    start (controller) {
      for (const chunk of chunks) {
        controller.enqueue(binary && typeof chunk === 'string'
          ? new TextEncoder().encode(chunk)
          : chunk)
      }
      controller.close()
    }
  })
}
