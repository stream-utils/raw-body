var assert = require('assert')
var getRawBody = require('..')
var Readable = require('stream').Readable

describe('using native streams', function () {
  it('should read contents', function (done) {
    var stream = createStream(Buffer.from('hello, streams!'))

    getRawBody(stream, function (err, buf) {
      assert.ifError(err)
      assert.strictEqual(buf.toString(), 'hello, streams!')
      done()
    })
  })

  it('should read pre-buffered contents', function (done) {
    var stream = createStream(Buffer.from('hello, streams!'))
    stream.push('oh, ')

    getRawBody(stream, function (err, buf) {
      assert.ifError(err)
      assert.strictEqual(buf.toString(), 'oh, hello, streams!')
      done()
    })
  })

  it('should stop the stream on limit', function (done) {
    var stream = createStream(Buffer.from('hello, streams!'))

    getRawBody(stream, { limit: 2 }, function (err, buf) {
      assert.ok(err)
      assert.strictEqual(err.status, 413)
      assert.strictEqual(err.limit, 2)
      process.nextTick(done)
    })
  })

  it('should throw if stream is not readable', function (done) {
    var stream = createStream(Buffer.from('hello, streams!'))

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
  var stream = new Readable()
  stream._read = function () {
    stream.push(buf)
    stream.push(null)
  }

  return stream
}
