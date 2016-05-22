var assert = require('assert')
var Readable = require('readable-stream').Readable
var Writable = require('readable-stream').Writable

var getRawBody = require('../')

var defaultLimit = 1024 * 1024

// Add Promise to mocha's global list
global.Promise = global.Promise

describe('stream flowing', function () {
  describe('when limit lower then length', function (done) {
    it('should stop the steam flow', function (done) {
      var stream = createInfiniteStream()

      getRawBody(stream, {
        limit: defaultLimit,
        length: defaultLimit * 2
      }, function (err, body) {
        assert.ok(err)
        assert.equal(err.type, 'entity.too.large')
        assert.equal(err.message, 'request entity too large')
        assert.equal(err.statusCode, 413)
        assert.equal(err.length, defaultLimit * 2)
        assert.equal(err.limit, defaultLimit)
        assert.equal(body, undefined)
        assert.ok(stream.isPaused)

        done()
      })
    })

    it('should halt flowing stream', function (done) {
      var stream = createInfiniteStream(true)
      var dest = createBlackholeStream()

      // pipe the stream
      stream.pipe(dest)

      getRawBody(stream, {
        limit: defaultLimit * 2,
        length: defaultLimit
      }, function (err, body) {
        assert.ok(err)
        assert.equal(err.type, 'entity.too.large')
        assert.equal(err.message, 'request entity too large')
        assert.equal(err.statusCode, 413)
        assert.equal(body, undefined)
        assert.ok(stream.isPaused)
        done()
      })
    })
  })

  describe('when stream has encoding set', function (done) {
    it('should stop the steam flow', function (done) {
      var stream = createInfiniteStream()
      stream.setEncoding('utf8')

      getRawBody(stream, {
        limit: defaultLimit
      }, function (err, body) {
        assert.ok(err)
        assert.equal(err.type, 'stream.encoding.set')
        assert.equal(err.message, 'stream encoding should not be set')
        assert.equal(err.statusCode, 500)
        assert.ok(stream.isPaused)

        done()
      })
    })
  })

  describe('when stream has limit', function (done) {
    it('should stop the steam flow', function (done) {
      var stream = createInfiniteStream()

      getRawBody(stream, {
        limit: defaultLimit
      }, function (err, body) {
        assert.ok(err)
        assert.equal(err.type, 'entity.too.large')
        assert.equal(err.statusCode, 413)
        assert.ok(err.received > defaultLimit)
        assert.equal(err.limit, defaultLimit)
        assert.ok(stream.isPaused)

        done()
      })
    })
  })

  describe('when stream has limit', function (done) {
    it('should stop the steam flow', function (done) {
      var stream = createInfiniteStream()

      getRawBody(stream, function (err, body) {
        assert.ok(err)
        assert.equal(err.message, 'BOOM')
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
  var base = Math.random().toString(32)
  var KB_4 = 32 * 4
  var KB_8 = KB_4 * 2
  var KB_16 = KB_8 * 2
  var KB_64 = KB_16 * 4

  var rand = Math.random()
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
  var stream = new Writable()
  stream._write = function (chunk, encoding, cb) {
    cb()
  }

  return stream
}

function createInfiniteStream (paused) {
  var stream = new Readable()
  stream._read = function () {
    var rand = 2 + Math.floor(Math.random() * 10)

    setTimeout(function () {
      for (var i = 0; i < rand; i++) {
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
