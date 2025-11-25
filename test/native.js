const assert = require('assert')
const getRawBody = require('..')
const Readable = require('stream').Readable

describe('using native streams', function () {
  it('should read contents', function (done) {
    const stream = createStream(Buffer.from('hello, streams!'))

    getRawBody(stream, function (err, buf) {
      assert.ifError(err)
      assert.strictEqual(buf.toString(), 'hello, streams!')
      done()
    })
  })

  it('should read pre-buffered contents', function (done) {
    const stream = createStream(Buffer.from('hello, streams!'))
    stream.push('oh, ')

    getRawBody(stream, function (err, buf) {
      assert.ifError(err)
      assert.strictEqual(buf.toString(), 'oh, hello, streams!')
      done()
    })
  })

  it('should stop the stream on limit', function (done) {
    const stream = createStream(Buffer.from('hello, streams!'))

    getRawBody(stream, { limit: 2 }, function (err, buf) {
      assert.ok(err)
      assert.strictEqual(err.status, 413)
      assert.strictEqual(err.limit, 2)
      process.nextTick(done)
    })
  })

  it('should throw if stream is not readable', function (done) {
    const stream = createStream(Buffer.from('hello, streams!'))

    stream.resume()
    stream.on('end', function () {
      getRawBody(stream, function (err) {
        assert.ok(err)
        assert.strictEqual(err.status, 500)
        assert.strictEqual(err.type, 'stream.not.readable')
        assert.strictEqual(err.message, 'stream is not readable')
        process.nextTick(done)
      })
    })
  })
})

function createStream (buf) {
  const stream = new Readable()
  stream._read = function () {
    stream.push(buf)
    stream.push(null)
  }

  return stream
}
