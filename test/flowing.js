const assert = require('assert')
const Readable = require('stream').Readable
const Writable = require('stream').Writable

const getRawBody = require('../')

const defaultLimit = 1024 * 1024

describe('stream flowing', function () {
  this.timeout(5000)

  describe('when limit lower then length', function (done) {
    it('should stop the steam flow', function (done) {
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
        assert.ok(stream.isPaused)

        done()
      })
    })

    it('should halt flowing stream', function (done) {
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
        assert.ok(stream.isPaused)
        done()
      })
    })
  })

  describe('when stream has encoding set', function (done) {
    it('should stop the steam flow', function (done) {
      const stream = createInfiniteStream()
      stream.setEncoding('utf8')

      getRawBody(stream, {
        limit: defaultLimit
      }, function (err, body) {
        assert.ok(err)
        assert.strictEqual(err.type, 'stream.encoding.set')
        assert.strictEqual(err.message, 'stream encoding should not be set')
        assert.strictEqual(err.statusCode, 500)
        assert.ok(stream.isPaused)

        done()
      })
    })
  })

  describe('when stream has limit', function (done) {
    it('should stop the steam flow', function (done) {
      const stream = createInfiniteStream()

      getRawBody(stream, {
        limit: defaultLimit
      }, function (err, body) {
        assert.ok(err)
        assert.strictEqual(err.type, 'entity.too.large')
        assert.strictEqual(err.statusCode, 413)
        assert.ok(err.received > defaultLimit)
        assert.strictEqual(err.limit, defaultLimit)
        assert.ok(stream.isPaused)

        done()
      })
    })
  })

  describe('when stream has limit', function (done) {
    it('should stop the steam flow', function (done) {
      const stream = createInfiniteStream()

      getRawBody(stream, function (err, body) {
        assert.ok(err)
        assert.strictEqual(err.message, 'BOOM')
        assert.ok(stream.isPaused)

        done()
      })

      setTimeout(function () {
        stream.emit('error', new Error('BOOM'))
      }, 500)
    })
  })
})

function createChunk () {
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

  function repeat (str, num) {
    return new Array(num + 1).join(str)
  }
}

function createBlackholeStream () {
  const stream = new Writable()
  stream._write = function (chunk, encoding, cb) {
    cb()
  }

  return stream
}

function createInfiniteStream (paused) {
  const stream = new Readable()
  stream._read = function () {
    const rand = 2 + Math.floor(Math.random() * 10)

    setTimeout(function () {
      for (let i = 0; i < rand; i++) {
        stream.push(createChunk())
      }
    }, 100)
  }

  // track paused state for tests
  stream.isPaused = false
  stream.on('pause', function () { this.isPaused = true })
  stream.on('resume', function () { this.isPaused = false })

  // immediately put the stream in flowing mode
  if (!paused) {
    stream.resume()
  }

  return stream
}
