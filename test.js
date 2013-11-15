var assert = require('assert')
var fs = require('fs')
var path = require('path')
var Stream = require('stream')
var co = require('co')

var getRawBody = require('./')

var file = path.join(__dirname, 'index.js')
var length = fs.statSync(file).size
var string = fs.readFileSync(file, 'utf8')

function createStream() {
  return fs.createReadStream(file)
}

function checkBuffer(buf) {
  assert.ok(Buffer.isBuffer(buf))
  assert.equal(buf.length, length)
  assert.equal(buf.toString('utf8'), string)
}

describe('Raw Body', function () {
  it('should work without any options', function (done) {
    getRawBody(createStream(), function (err, buf) {
      assert.ifError(err)
      checkBuffer(buf)
      done()
    })
  })

  it('should work as a yieldable', function (done) {
    co(function* () {
      var buf = yield getRawBody(createStream())
      checkBuffer(buf)
    })(done)
  })

  it('should work with expected length', function (done) {
    getRawBody(createStream(), {
      expected: length
    }, function (err, buf) {
      assert.ifError(err)
      checkBuffer(buf)
      done()
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

  it('should work with limit and expected length', function (done) {
    getRawBody(createStream(), {
      expected: length,
      limit: length + 1
    }, function (err, buf) {
      assert.ifError(err)
      checkBuffer(buf)
      done()
    })
  })

  it('should check options for limit and expected length', function (done) {
    var stream = createStream()
    // Stream should still be consumed.
    stream.once('end', done)

    getRawBody(stream, {
      expected: length,
      limit: length - 1
    }, function (err, buf) {
      assert.equal(err.status, 413)
    })
  })

  it('should work as a yieldable when expected > limit', function (done) {
    co(function* () {
      try {
        yield getRawBody(createStream(), {
          expected: length,
          limit: length - 1
        })
        throw new Error()
      } catch (err) {
        assert.equal(err.status, 413)
      }
    })(done)
  })

  it('should work with an empty stream', function (done) {
    var stream = new Stream()

    getRawBody(stream, {
      expected: 0,
      limit: 1
    }, function (err, buf) {
      assert.ifError(err)
      assert.equal(buf.length, 0)
      done()
    })

    stream.emit('end')
  })

  it('should throw on empty string and incorrect expected length', function (done) {
    var stream = new Stream()

    getRawBody(stream, {
      expected: 1,
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

  it('should throw if length !== expected length', function (done) {
    getRawBody(createStream(), {
      expected: length - 1
    }, function (err, buf) {
      assert.equal(err.status, 400)
      done()
    })
  })
})