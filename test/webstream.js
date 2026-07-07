const assert = require('assert')
const getRawBody = require('..')

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

  it('should work with a custom decoder', async function () {
    const iconv = require('iconv-lite')
    const str = await getRawBody(createWebStream([Buffer.from('636f6f6c20f09f9880', 'hex')]), {
      encoding: 'utf-8',
      decoder: iconv.getDecoder.bind(iconv)
    })
    assert.strictEqual(str, 'cool 😀')
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

  it('should ignore reads that settle after completion', function (done) {
    let released = false

    // stream whose reader settles the same read multiple times;
    // promise assimilation must neutralize the extra settlements
    const stream = {
      locked: false,
      getReader () {
        return {
          releaseLock () { released = true },
          read () {
            return {
              then (resolve, reject) {
                // exceeds the limit, so this completes the read
                resolve({ done: false, value: Buffer.from('hello, world!') })

                // misbehaving thenable: settles again after completion
                resolve({ done: false, value: Buffer.from('more') })
                reject(new Error('boom'))
              }
            }
          }
        }
      }
    }

    let calls = 0

    getRawBody(stream, { limit: 5 }, function (err) {
      calls++
      assert.strictEqual(calls, 1)
      assert.strictEqual(err.status, 413)
      assert.strictEqual(err.type, 'entity.too.large')
      assert.strictEqual(released, true)
      done()
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
