const assert = require('assert')
const getRawBody = require('..')
const http = require('http')
const net = require('net')
const { Readable } = require('stream')

// socket.resetAndDestroy() requires node >= 18.3
const itLiveReset = typeof net.Socket.prototype.resetAndDestroy === 'function'
  ? it
  : it.skip

describe('using web streams', function () {
  it('should read a ReadableStream into a buffer', async function () {
    const buf = await getRawBody(createWebStream(['hello', ', ', 'world!']))
    assert.ok(Buffer.isBuffer(buf))
    assert.strictEqual(buf.toString(), 'hello, world!')
  })

  it('should read an empty ReadableStream', async function () {
    const buf = await getRawBody(createWebStream([]))
    assert.ok(Buffer.isBuffer(buf))
    assert.strictEqual(buf.length, 0)
  })

  it('should work with encoding', async function () {
    const str = await getRawBody(createWebStream(['hello, world!']), {
      encoding: 'utf-8'
    })
    assert.strictEqual(str, 'hello, world!')
  })

  it('should work with `true` as an option', async function () {
    const str = await getRawBody(createWebStream(['hello, world!']), true)
    assert.strictEqual(str, 'hello, world!')
  })

  it('should decode multi-byte characters split across chunks', async function () {
    const bytes = Buffer.from('é€好', 'utf-8')
    const str = await getRawBody(createWebStream([
      bytes.subarray(0, 3),
      bytes.subarray(3)
    ]), {
      encoding: 'utf-8'
    })
    assert.strictEqual(str, 'é€好')
  })

  it('should work with string chunks', async function () {
    const buf = await getRawBody(createWebStream(['hello', ', world!'], { binary: false }))
    assert.ok(Buffer.isBuffer(buf))
    assert.strictEqual(buf.toString(), 'hello, world!')
  })

  it('should error on string chunks when encoding is set', async function () {
    // an already-decoded stream, e.g. piped through TextDecoderStream;
    // re-decoding it with the declared encoding would corrupt the data
    const stream = createWebStream(['hello, world!'], { binary: false })

    await assert.rejects(getRawBody(stream, { encoding: 'utf-16le' }), function (err) {
      assert.strictEqual(err.status, 500)
      assert.strictEqual(err.type, 'stream.encoding.set')
      return true
    })

    assert.strictEqual(stream.locked, false)
  })

  it('should work with a custom decoder', async function () {
    const iconv = require('iconv-lite')
    const str = await getRawBody(createWebStream([Buffer.from('636f6f6c20f09f9880', 'hex')]), {
      encoding: 'utf-8',
      decoder: iconv.getDecoder.bind(iconv)
    })
    assert.strictEqual(str, 'cool 😀')
  })

  it('should decode encodings unsupported by TextDecoder', async function () {
    const iconv = require('iconv-lite')
    const bytes = iconv.encode('¿Cómo estás?', 'utf-32le')

    // split mid-character: each utf-32 code unit is 4 bytes,
    // so the decoder must carry state across chunks
    const str = await getRawBody(createWebStream([
      bytes.subarray(0, 6),
      bytes.subarray(6)
    ]), {
      encoding: 'utf-32le',
      decoder: iconv.getDecoder.bind(iconv)
    })

    assert.strictEqual(str, '¿Cómo estás?')
  })

  it('should work with the callback style', function (done) {
    getRawBody(createWebStream(['hello, world!']), function (err, buf) {
      assert.ifError(err)
      assert.strictEqual(buf.toString(), 'hello, world!')
      done()
    })
  })

  it('should check length', async function () {
    const buf = await getRawBody(createWebStream(['hello, world!']), {
      length: 13
    })
    assert.strictEqual(buf.toString(), 'hello, world!')
  })

  it('should error with length mismatch', async function () {
    await assert.rejects(getRawBody(createWebStream(['hello, world!']), {
      length: 10
    }), function (err) {
      assert.strictEqual(err.status, 400)
      assert.strictEqual(err.type, 'request.size.invalid')
      assert.strictEqual(err.expected, 10)
      assert.strictEqual(err.received, 13)
      return true
    })
  })

  it('should error when limit is exceeded', async function () {
    await assert.rejects(getRawBody(createWebStream(['hello, world!']), {
      limit: 5
    }), function (err) {
      assert.strictEqual(err.status, 413)
      assert.strictEqual(err.type, 'entity.too.large')
      assert.strictEqual(err.limit, 5)
      return true
    })
  })

  it('should error early when length > limit', async function () {
    const stream = createWebStream(['hello, world!'])

    await assert.rejects(getRawBody(stream, {
      length: 13,
      limit: 5
    }), function (err) {
      assert.strictEqual(err.status, 413)
      assert.strictEqual(err.type, 'entity.too.large')
      return true
    })

    // the stream was never locked, so it is still usable
    assert.strictEqual(stream.locked, false)
  })

  it('should error for an unsupported encoding', async function () {
    await assert.rejects(getRawBody(createWebStream(['hello, world!']), {
      encoding: 'foo/bar'
    }), function (err) {
      assert.strictEqual(err.status, 415)
      assert.strictEqual(err.type, 'encoding.unsupported')
      return true
    })
  })

  it('should error when the stream is locked', async function () {
    const stream = createWebStream(['hello, world!'])
    const reader = stream.getReader()

    await assert.rejects(getRawBody(stream), function (err) {
      assert.strictEqual(err.status, 500)
      assert.strictEqual(err.type, 'stream.not.readable')
      return true
    })

    reader.releaseLock()
  })

  it('should error when the body was already consumed', async function () {
    const res = new Response('hello, world!')
    await res.text()

    await assert.rejects(getRawBody(res.body), function (err) {
      assert.strictEqual(err.status, 500)
      assert.strictEqual(err.type, 'stream.not.readable')
      return true
    })
  })

  it('should error when the stream is locked by a pipe', async function () {
    const stream = createWebStream(['hello, world!'])
    const piped = stream.pipeThrough(new TextDecoderStream())

    await assert.rejects(getRawBody(stream), function (err) {
      assert.strictEqual(err.status, 500)
      assert.strictEqual(err.type, 'stream.not.readable')
      return true
    })

    await piped.cancel()
  })

  it('should error when the stream was cancelled', async function () {
    const stream = createWebStream(['hello, world!'])
    await stream.cancel()

    await assert.rejects(getRawBody(stream), function (err) {
      assert.strictEqual(err.status, 500)
      assert.strictEqual(err.type, 'stream.not.readable')
      return true
    })
  })

  it('should error when the stream was already read', async function () {
    const stream = createWebStream(['hello, world!'])
    const reader = stream.getReader()
    while (!(await reader.read()).done);
    reader.releaseLock()

    await assert.rejects(getRawBody(stream), function (err) {
      assert.strictEqual(err.status, 500)
      assert.strictEqual(err.type, 'stream.not.readable')
      return true
    })
  })

  it('should map aborts to request.aborted', async function () {
    // deliver one chunk, then abort: erroring in start() would
    // discard the queued chunk, so error on the second pull
    let pulls = 0
    const stream = new ReadableStream({
      pull (controller) {
        if (pulls++ === 0) {
          controller.enqueue(new TextEncoder().encode('hel'))
        } else {
          controller.error(new DOMException('This operation was aborted', 'AbortError'))
        }
      }
    })

    await assert.rejects(getRawBody(stream, { length: 10 }), function (err) {
      assert.strictEqual(err.status, 400)
      assert.strictEqual(err.type, 'request.aborted')
      assert.strictEqual(err.code, 'ECONNABORTED')
      assert.strictEqual(err.expected, 10)
      assert.strictEqual(err.received, 3)
      return true
    })
  })

  it('should map aborts from Readable.toWeb request streams', function (done) {
    const server = http.createServer(function (req, res) {
      getRawBody(Readable.toWeb(req), {
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
    })

    server.listen(0, function () {
      const req = http.request({
        port: server.address().port,
        method: 'POST',
        headers: { 'content-length': '100' }
      })

      req.on('error', function () {}) // socket hang up
      req.write('partial')

      setTimeout(function () { req.destroy() }, 20)
    })
  })

  it('should not map non-abort connection resets to request.aborted', async function () {
    // a raw socket reset is a transport failure, not a client
    // abort: the node path passes it through, so must this one.
    // this is the exact error a net.Socket read produces on a
    // TCP RST (recreated: producing a live RST needs
    // socket.resetAndDestroy, which requires node >= 18.3)
    const reset = new Error('read ECONNRESET')
    reset.code = 'ECONNRESET'

    const stream = new ReadableStream({
      start (controller) {
        controller.error(reset)
      }
    })

    await assert.rejects(getRawBody(stream), function (err) {
      assert.strictEqual(err, reset)
      assert.notStrictEqual(err.type, 'request.aborted')
      return true
    })
  })

  itLiveReset('should pass through a live socket reset unmapped', function (done) {
    const server = net.createServer(function (socket) {
      socket.write('partial')
      setTimeout(function () { socket.resetAndDestroy() }, 10)
    })

    server.listen(0, function () {
      const socket = net.connect(server.address().port)

      socket.on('connect', function () {
        getRawBody(Readable.toWeb(socket), function (err) {
          server.close()

          assert.ok(err)
          assert.strictEqual(err.code, 'ECONNRESET')
          assert.strictEqual(err.message, 'read ECONNRESET')
          assert.notStrictEqual(err.type, 'request.aborted')
          done()
        })
      })
    })
  })

  it('should map destroyed Readable.toWeb streams to request.aborted', function (done) {
    const nodeStream = new Readable({ read () {} })
    const webStream = Readable.toWeb(nodeStream)

    getRawBody(webStream, function (err) {
      assert.ok(err)
      assert.strictEqual(err.status, 400)
      assert.strictEqual(err.type, 'request.aborted')
      assert.strictEqual(err.received, 7)
      done()
    })

    nodeStream.push(Buffer.from('partial'))
    setTimeout(function () { nodeStream.destroy() }, 10)
  })

  it('should propagate stream errors', async function () {
    const stream = new ReadableStream({
      start (controller) {
        controller.enqueue(new TextEncoder().encode('hello'))
        controller.error(new Error('boom'))
      }
    })

    await assert.rejects(getRawBody(stream), /boom/)
  })

  it('should error when the decoder throws while writing', async function () {
    const stream = createWebStream(['hello, world!'])

    await assert.rejects(getRawBody(stream, {
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

    await assert.rejects(getRawBody(stream, {
      encoding: 'utf-8',
      decoder: function () {
        return {
          write (chunk) { return '' },
          end () { throw new Error('decoder end failed') }
        }
      }
    }), /decoder end failed/)

    assert.strictEqual(stream.locked, false)
  })

  it('should normalize non-Error stream failures', async function () {
    // e.g. controller.error('timeout') or abort(reason) with a
    // string: callers must always receive an Error instance
    const stream = new ReadableStream({
      start (controller) {
        controller.error('timeout')
      }
    })

    await assert.rejects(getRawBody(stream), function (err) {
      assert.ok(err instanceof Error)
      assert.strictEqual(err.message, 'stream error')
      assert.strictEqual(err.cause, 'timeout')
      return true
    })
  })

  it('should reject when the stream errors without a reason', async function () {
    const stream = new ReadableStream({
      start (controller) {
        controller.error()
      }
    })

    await assert.rejects(getRawBody(stream), /stream error/)
  })

  it('should error when the stream yields an invalid chunk', async function () {
    const stream = new ReadableStream({
      start (controller) {
        controller.enqueue(undefined)
        controller.close()
      }
    })

    await assert.rejects(getRawBody(stream), TypeError)

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

    await assert.rejects(getRawBody(stream, { limit: 5 }), /Uint8Array or string/)
    assert.strictEqual(stream.locked, false)
  })

  it('should copy chunks whose memory the producer reuses', async function () {
    // a producer may legally recycle one scratch buffer
    // across enqueues; retained views would all end up
    // pointing at the last chunk's bytes
    const scratch = new Uint8Array(4)
    const parts = ['aaaa', 'bbbb', 'cccc']
    let reads = 0

    const stream = new ReadableStream({
      pull (controller) {
        if (reads === parts.length) return controller.close()
        scratch.set(new TextEncoder().encode(parts[reads++]))
        controller.enqueue(scratch)
      }
    })

    const buf = await getRawBody(stream)
    assert.strictEqual(buf.toString(), 'aaaabbbbcccc')
  })

  it('should release the lock when finished', async function () {
    const stream = createWebStream(['hello, world!'])
    await getRawBody(stream)
    assert.strictEqual(stream.locked, false)
  })

  it('should read the body of a fetch Response', async function () {
    const res = new Response('hello, world!')
    const str = await getRawBody(res.body, {
      encoding: 'utf-8',
      limit: '1kb'
    })
    assert.strictEqual(str, 'hello, world!')
  })

  it('should read the stream of a Blob', async function () {
    const blob = new Blob(['hello, world!'])
    const str = await getRawBody(blob.stream(), {
      encoding: 'utf-8'
    })
    assert.strictEqual(str, 'hello, world!')
  })

  it('should read the body of a fetch Request', async function () {
    const req = new Request('http://localhost/', {
      method: 'POST',
      body: 'hello, world!'
    })
    const str = await getRawBody(req.body, {
      encoding: 'utf-8'
    })
    assert.strictEqual(str, 'hello, world!')
  })

  it('should read the readable side of a TransformStream', async function () {
    const gzipped = await getRawBody(
      new Blob(['hello, world!']).stream().pipeThrough(new CompressionStream('gzip'))
    )
    const str = await getRawBody(
      new Blob([gzipped]).stream().pipeThrough(new DecompressionStream('gzip')),
      { encoding: 'utf-8' }
    )
    assert.strictEqual(str, 'hello, world!')
  })

  it('should not invoke the callback synchronously on early errors', function (done) {
    let returned = false

    getRawBody(createWebStream(['hello, world!']), {
      length: 13,
      limit: 5
    }, function (err) {
      assert.strictEqual(returned, true)
      assert.strictEqual(err.type, 'entity.too.large')
      done()
    })

    returned = true
  })

  it('should not catch or re-invoke a callback that throws', function (done) {
    // take over unhandled rejections for this test, so mocha's
    // own handler does not fail the test for the expected one
    const listeners = process.listeners('unhandledRejection')
    process.removeAllListeners('unhandledRejection')

    let calls = 0
    const failure = new Error('callback bug')

    process.once('unhandledRejection', function (err) {
      for (const listener of listeners) {
        process.on('unhandledRejection', listener)
      }

      // the throw must surface as an unhandled rejection with
      // the original error — not be misread as a stream error
      // and invoke the callback again
      assert.strictEqual(err, failure)
      assert.strictEqual(calls, 1)
      done()
    })

    getRawBody(createWebStream(['hello, world!']), function () {
      calls++
      throw failure
    })
  })

  it('should release the lock on error', async function () {
    const stream = createWebStream(['hello', ', world!'])

    await assert.rejects(getRawBody(stream, { limit: 3 }))

    // the lock is released, so the rest of the stream can be handled
    assert.strictEqual(stream.locked, false)
    await stream.cancel()
  })
})

function createWebStream (chunks, options) {
  const binary = !options || options.binary !== false

  return new ReadableStream({
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
