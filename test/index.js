var assert = require('assert')
var fs = require('fs')
var path = require('path')
var http = require('http')
var through = require('through2')
var request = require('request')
var Readable = require('readable-stream').Readable

var getRawBody = require('../')

var file = path.join(__dirname, 'index.js')
var length = fs.statSync(file).size
var string = fs.readFileSync(file, 'utf8')

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

  it('should work as a thunk', function (done) {
    var thunk = getRawBody(createStream())
    thunk(function (err, buf) {
      assert.ifError(err)
      checkBuffer(buf)
      done()
    })
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
    var t = through()
    t.end()

    getRawBody(t, {
      length: 0,
      encoding: true
    }, function (err, str) {
      assert.ifError(err)
      assert.equal(str, '')
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
      assert.deepEqual(err, {
        type: 'entity.too.large',
        message: 'request entity too large',
        statusCode: 413,
        status: 413,
        expected: length,
        length: length,
        limit: length - 1
      })
      done()
    })
  })

  it('should work as a thunk when length > limit', function (done) {
    var thunk = getRawBody(createStream(), {
      length: length,
      limit: length - 1
    })
    thunk(function (err, buf) {
      assert.equal(err.status, 413)
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

  it('should throw when given an invalid encoding', function () {
    var err
    try {
      getRawBody(new Readable(), {
        encoding: 'akljsdflkajsdf'
      }, function () {})
    } catch (e) {
      err = e
    }
    assert.ok(err)
    assert.ok(/encoding/.test(err.message))
    assert.equal(err.status, 415)
  })

  describe('when an encoding is set', function () {
    it('should return a string', function (done) {
      getRawBody(createStream(), {
        encoding: 'utf8'
      }, function (err, str) {
        assert.ifError(err)
        assert.equal(str, string)
        done()
      })
    })

    it('should handle encoding true', function (done) {
      getRawBody(createStream(), {
        encoding: true
      }, function (err, str) {
        assert.ifError(err)
        assert.equal(str, string)
        done()
      })
    })

    it('should handle encoding as options string', function (done) {
      getRawBody(createStream(), 'utf8', function (err, str) {
        assert.ifError(err)
        assert.equal(str, string)
        done()
      })
    })

    it('should decode codepage string', function (done) {
      var stream = createStream(new Buffer('bf43f36d6f20657374e1733f', 'hex'))
      var string = '¿Cómo estás?'
      getRawBody(stream, 'iso-8859-1', function (err, str) {
        assert.ifError(err)
        assert.equal(str, string)
        done()
      })
    })

    it('should decode UTF-8 string', function (done) {
      var stream = createStream(new Buffer('c2bf43c3b36d6f20657374c3a1733f', 'hex'))
      var string = '¿Cómo estás?'
      getRawBody(stream, 'utf-8', function (err, str) {
        assert.ifError(err)
        assert.equal(str, string)
        done()
      })
    })

    it('should decode UTF-16 string (LE BOM)', function (done) {
      // BOM makes this LE
      var stream = createStream(new Buffer('fffebf004300f3006d006f002000650073007400e10073003f00', 'hex'))
      var string = '¿Cómo estás?'
      getRawBody(stream, 'utf-16', function (err, str) {
        assert.ifError(err)
        assert.equal(str, string)
        done()
      })
    })

    it('should decode UTF-16 string (BE BOM)', function (done) {
      // BOM makes this BE
      var stream = createStream(new Buffer('feff00bf004300f3006d006f002000650073007400e10073003f', 'hex'))
      var string = '¿Cómo estás?'
      getRawBody(stream, 'utf-16', function (err, str) {
        assert.ifError(err)
        assert.equal(str, string)
        done()
      })
    })

    it('should decode UTF-16LE string', function (done) {
      // UTF-16LE is different from UTF-16 due to BOM behavior
      var stream = createStream(new Buffer('bf004300f3006d006f002000650073007400e10073003f00', 'hex'))
      var string = '¿Cómo estás?'
      getRawBody(stream, 'utf-16le', function (err, str) {
        assert.ifError(err)
        assert.equal(str, string)
        done()
      })
    })

    it('should correctly calculate the expected length', function (done) {
      var stream = createStream(new Buffer('{"test":"å"}'))

      getRawBody(stream, {
        encoding: 'utf8',
        length: 13
      }, done)
    })
  })

  it('should work on streams1 stream', function (done) {
    var stream = through()
    stream.pause()
    stream.write('foobar')
    stream.write('foobaz')
    stream.write('yay!!')
    stream.end()

    getRawBody(stream, {
      encoding: true,
      length: 17
    }, function (err, value) {
      assert.ifError(err)
      done()
    })

    // you have to call resume() for through
    stream.resume()
  })

  describe('when using with http server', function () {
    var PORT = 10000 + Math.floor(Math.random() * 20000)
    var uri = 'http://localhost:' + PORT
    var server = http.createServer()

    before(function (done) {
      server.on('request', function (req, res) {
        if (req.headers['x-req-encoding']) {
          req.setEncoding(req.headers['x-req-encoding']);
        }

        getRawBody(req, {
          length: req.headers['content-length']
        }, function (err, body) {
          if (err) {
            res.statusCode = 500
            return res.end(err.message)
          }

          res.end(body)
        })
      })

      server.listen(PORT, done)
    })

    it('should echo data', function (done) {
      var resp = createStream().pipe(request({
        uri: uri,
        method: 'POST'
      }))

      getRawBody(resp, {
        encoding: true
      }, function (err, str) {
        assert.ifError(err)
        assert.equal(str, string)

        done()
      })
    })

    it('should throw if stream encoding is set', function (done) {
      var resp = createStream().pipe(request({
        uri: uri,
        method: 'POST',
        headers: {
          'x-req-encoding': 'utf8'
        }
      }))

      getRawBody(resp, {
        encoding: true
      }, function (err, str) {
        assert.ifError(err)
        assert.equal(str, 'stream encoding should not be set')

        done()
      })
    })

    after(function (done) {
      server.close(done)
    })
  })
})

function checkBuffer(buf) {
  assert.ok(Buffer.isBuffer(buf))
  assert.equal(buf.length, length)
  assert.equal(buf.toString('utf8'), string)
}

function createStream(buf) {
  if (!buf) return fs.createReadStream(file)

  var stream = new Readable()
  stream._read = function () {
    stream.push(buf)
    stream.push(null)
  }

  return stream
}
