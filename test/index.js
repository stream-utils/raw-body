var assert = require('assert')
var fs = require('fs')
var getRawBody = require('..')
var path = require('path')

var Buffer = require('safe-buffer').Buffer
var EventEmitter = require('events').EventEmitter
var Promise = global.Promise || require('bluebird')
var Readable = require('readable-stream').Readable

var file = path.join(__dirname, 'index.js')
var length = fs.statSync(file).size
var string = fs.readFileSync(file, 'utf8')

// Add Promise to mocha's global list
global.Promise = global.Promise

describe('Raw Body', function () {
  it('should work without any options', function (done) {
    getRawBody(createStream(), function (err, buf) {
      assert.ifError(err)
      checkBuffer(buf)
      done()
    })
  })

  it('should work with `true` as an option', function (done) {
    getRawBody(createStream(), true, function (err, buf) {
      assert.ifError(err)
      assert.equal(typeof buf, 'string')
      done()
    })
  })

  it('should error for bad callback', function () {
    assert.throws(function () {
      getRawBody(createStream(), true, 'silly')
    }, /argument callback.*function/)
  })

  it('should work with length', function (done) {
    getRawBody(createStream(), {
      length: length
    }, function (err, buf) {
      assert.ifError(err)
      checkBuffer(buf)
      done()
    })
  })

  it('should work when length=0', function (done) {
    var stream = new EventEmitter()

    getRawBody(stream, {
      length: 0,
      encoding: true
    }, function (err, str) {
      assert.ifError(err)
      assert.equal(str, '')
      done()
    })

    process.nextTick(function () {
      stream.emit('end')
    })
  })

  it('should work with limit', function (done) {
    getRawBody(createStream(), {
      limit: length + 1
    }, function (err, buf) {
      assert.ifError(err)
      checkBuffer(buf)
      done()
    })
  })

  it('should work with limit as a string', function (done) {
    getRawBody(createStream(), {
      limit: '1gb'
    }, function (err, buf) {
      assert.ifError(err)
      checkBuffer(buf)
      done()
    })
  })

  it('should work with limit and length', function (done) {
    getRawBody(createStream(), {
      length: length,
      limit: length + 1
    }, function (err, buf) {
      assert.ifError(err)
      checkBuffer(buf)
      done()
    })
  })

  it('should check options for limit and length', function (done) {
    getRawBody(createStream(), {
      length: length,
      limit: length - 1
    }, function (err, buf) {
      assert.equal(err.status, 413)
      assert.equal(err.statusCode, 413)
      assert.equal(err.expected, length)
      assert.equal(err.length, length)
      assert.equal(err.limit, length - 1)
      assert.equal(err.type, 'entity.too.large')
      assert.equal(err.message, 'request entity too large')
      done()
    })
  })

  it('should work with an empty stream', function (done) {
    var stream = new Readable()
    stream.push(null)

    getRawBody(stream, {
      length: 0,
      limit: 1
    }, function (err, buf) {
      assert.ifError(err)
      assert.equal(buf.length, 0)
      done()
    })

    stream.emit('end')
  })

  it('should throw on empty string and incorrect length', function (done) {
    var stream = new Readable()
    stream.push(null)

    getRawBody(stream, {
      length: 1,
      limit: 2
    }, function (err, buf) {
      assert.equal(err.status, 400)
      done()
    })

    stream.emit('end')
  })

  it('should throw if length > limit', function (done) {
    getRawBody(createStream(), {
      limit: length - 1
    }, function (err, buf) {
      assert.equal(err.status, 413)
      done()
    })
  })

  it('should throw if incorrect length supplied', function (done) {
    getRawBody(createStream(), {
      length: length - 1
    }, function (err, buf) {
      assert.equal(err.status, 400)
      done()
    })
  })

  it('should work with if length is null', function (done) {
    getRawBody(createStream(), {
      length: null,
      limit: length + 1
    }, function (err, buf) {
      assert.ifError(err)
      checkBuffer(buf)
      done()
    })
  })

  it('should work with {"test":"å"}', function (done) {
    // https://github.com/visionmedia/express/issues/1816

    var stream = new Readable()
    stream.push('{"test":"å"}')
    stream.push(null)

    getRawBody(stream, {
      length: 13
    }, function (err, buf) {
      if (err) return done(err)
      assert.ok(buf)
      assert.equal(buf.length, 13)
      done()
    })
  })

  it('should throw if stream encoding is set', function (done) {
    var stream = new Readable()
    stream.push('akl;sdjfklajsdfkljasdf')
    stream.push(null)
    stream.setEncoding('utf8')

    getRawBody(stream, function (err, buf) {
      assert.equal(err.status, 500)
      done()
    })
  })

  it('should throw when given an invalid encoding', function (done) {
    var stream = new Readable()
    stream.push('akl;sdjfklajsdfkljasdf')
    stream.push(null)

    getRawBody(stream, 'akljsdflkajsdf', function (err) {
      assert.ok(err)
      assert.equal(err.message, 'specified encoding unsupported')
      assert.equal(err.status, 415)
      assert.equal(err.type, 'encoding.unsupported')
      done()
    })
  })

  describe('with global Promise', function () {
    before(function () {
      global.Promise = Promise
    })

    after(function () {
      global.Promise = undefined
    })

    it('should work as a promise', function () {
      return getRawBody(createStream())
      .then(checkBuffer)
    })

    it('should work as a promise when length > limit', function () {
      return getRawBody(createStream(), {
        length: length,
        limit: length - 1
      })
      .then(throwExpectedError, function (err) {
        assert.equal(err.status, 413)
      })
    })
  })

  describe('without global Promise', function () {
    before(function () {
      global.Promise = undefined
    })

    after(function () {
      global.Promise = Promise
    })

    it('should error without callback', function () {
      assert.throws(function () {
        getRawBody(createStream())
      }, /argument callback.*required/)
    })

    it('should work with callback as second argument', function (done) {
      getRawBody(createStream(), function (err, buf) {
        assert.ifError(err)
        checkBuffer(buf)
        done()
      })
    })

    it('should work with callback as third argument', function (done) {
      getRawBody(createStream(), true, function (err, str) {
        assert.ifError(err)
        checkString(str)
        done()
      })
    })
  })

  describe('when an encoding is set', function () {
    it('should return a string', function (done) {
      getRawBody(createStream(), {
        encoding: 'utf-8'
      }, function (err, str) {
        assert.ifError(err)
        assert.equal(str, string)
        done()
      })
    })

    it('should handle encoding true as utf-8', function (done) {
      getRawBody(createStream(), {
        encoding: true
      }, function (err, str) {
        assert.ifError(err)
        assert.equal(str, string)
        done()
      })
    })

    it('should handle encoding as options string', function (done) {
      getRawBody(createStream(), 'utf-8', function (err, str) {
        assert.ifError(err)
        assert.equal(str, string)
        done()
      })
    })

    it('should decode codepage string', function (done) {
      var stream = createStream(Buffer.from('bf43f36d6f20657374e1733f', 'hex'))
      var string = '¿Cómo estás?'
      getRawBody(stream, 'iso-8859-1', function (err, str) {
        assert.ifError(err)
        assert.equal(str, string)
        done()
      })
    })

    it('should decode UTF-8 string', function (done) {
      var stream = createStream(Buffer.from('c2bf43c3b36d6f20657374c3a1733f', 'hex'))
      var string = '¿Cómo estás?'
      getRawBody(stream, 'utf-8', function (err, str) {
        assert.ifError(err)
        assert.equal(str, string)
        done()
      })
    })

    it('should decode UTF-16 string (LE BOM)', function (done) {
      // BOM makes this LE
      var stream = createStream(Buffer.from('fffebf004300f3006d006f002000650073007400e10073003f00', 'hex'))
      var string = '¿Cómo estás?'
      getRawBody(stream, 'utf-16', function (err, str) {
        assert.ifError(err)
        assert.equal(str, string)
        done()
      })
    })

    it('should decode UTF-16 string (BE BOM)', function (done) {
      // BOM makes this BE
      var stream = createStream(Buffer.from('feff00bf004300f3006d006f002000650073007400e10073003f', 'hex'))
      var string = '¿Cómo estás?'
      getRawBody(stream, 'utf-16', function (err, str) {
        assert.ifError(err)
        assert.equal(str, string)
        done()
      })
    })

    it('should decode UTF-16LE string', function (done) {
      // UTF-16LE is different from UTF-16 due to BOM behavior
      var stream = createStream(Buffer.from('bf004300f3006d006f002000650073007400e10073003f00', 'hex'))
      var string = '¿Cómo estás?'
      getRawBody(stream, 'utf-16le', function (err, str) {
        assert.ifError(err)
        assert.equal(str, string)
        done()
      })
    })

    it('should correctly calculate the expected length', function (done) {
      var stream = createStream(Buffer.from('{"test":"å"}'))

      getRawBody(stream, {
        encoding: 'utf-8',
        length: 13
      }, done)
    })
  })

  it('should work on streams1 stream', function (done) {
    var stream = new EventEmitter()

    getRawBody(stream, {
      encoding: true,
      length: 19
    }, function (err, value) {
      assert.ifError(err)
      assert.equal(value, 'foobar,foobaz,yay!!')
      done()
    })

    process.nextTick(function () {
      stream.emit('data', 'foobar,')
      stream.emit('data', 'foobaz,')
      stream.emit('data', 'yay!!')
      stream.emit('end')
    })
  })
})

function checkBuffer (buf) {
  assert.ok(Buffer.isBuffer(buf))
  assert.equal(buf.length, length)
  assert.equal(buf.toString('utf8'), string)
}

function checkString (str) {
  assert.ok(typeof str === 'string')
  assert.equal(str, string)
}

function createStream (buf) {
  if (!buf) return fs.createReadStream(file)

  var stream = new Readable()
  stream._read = function () {
    stream.push(buf)
    stream.push(null)
  }

  return stream
}

function throwExpectedError () {
  throw new Error('expected error')
}
