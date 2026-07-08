const assert = require('assert')
const asyncHooks = require('async_hooks')
const fs = require('fs')
const getRawBody = require('..')
const path = require('path')
const EventEmitter = require('events').EventEmitter
const Readable = require('stream').Readable

const file = path.join(__dirname, 'index.js')
const length = fs.statSync(file).size
const string = fs.readFileSync(file, 'utf8')

describe('Raw Body', function () {
  it('should validate stream', function () {
    assert.throws(function () { getRawBody() }, /argument stream is required/)
    assert.throws(function () { getRawBody(null) }, /argument stream must be a stream/)
    assert.throws(function () { getRawBody(42) }, /argument stream must be a stream/)
    assert.throws(function () { getRawBody('str') }, /argument stream must be a stream/)
    assert.throws(function () { getRawBody({}) }, /argument stream must be a stream/)
  })

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
      assert.strictEqual(typeof buf, 'string')
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
      length
    }, function (err, buf) {
      assert.ifError(err)
      checkBuffer(buf)
      done()
    })
  })

  it('should work when length=0', function (done) {
    const stream = new EventEmitter()

    getRawBody(stream, {
      length: 0,
      encoding: true
    }, function (err, str) {
      assert.ifError(err)
      assert.strictEqual(str, '')
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
      length,
      limit: length + 1
    }, function (err, buf) {
      assert.ifError(err)
      checkBuffer(buf)
      done()
    })
  })

  it('should check options for limit and length', function (done) {
    getRawBody(createStream(), {
      length,
      limit: length - 1
    }, function (err, buf) {
      assert.strictEqual(err.status, 413)
      assert.strictEqual(err.statusCode, 413)
      assert.strictEqual(err.expected, length)
      assert.strictEqual(err.length, length)
      assert.strictEqual(err.limit, length - 1)
      assert.strictEqual(err.type, 'entity.too.large')
      assert.strictEqual(err.message, 'request entity too large')
      done()
    })
  })

  it('should work with an empty stream', function (done) {
    const stream = new Readable()
    stream.push(null)

    getRawBody(stream, {
      length: 0,
      limit: 1
    }, function (err, buf) {
      assert.ifError(err)
      assert.strictEqual(buf.length, 0)
      done()
    })

    stream.emit('end')
  })

  it('should throw on empty string and incorrect length', function (done) {
    const stream = new Readable()
    stream.push(null)

    getRawBody(stream, {
      length: 1,
      limit: 2
    }, function (err, buf) {
      assert.strictEqual(err.status, 400)
      done()
    })

    stream.emit('end')
  })

  it('should throw if length > limit', function (done) {
    getRawBody(createStream(), {
      limit: length - 1
    }, function (err, buf) {
      assert.strictEqual(err.status, 413)
      done()
    })
  })

  it('should throw if incorrect length supplied', function (done) {
    getRawBody(createStream(), {
      length: length - 1
    }, function (err, buf) {
      assert.strictEqual(err.status, 400)
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

  it('should handle length as string number', function (done) {
    const testData = 'test'
    const expectedLength = testData.length

    const stream = new Readable()
    stream.push(testData)
    stream.push(null)

    getRawBody(stream, {
      length: String(expectedLength)
    }, function (err, buf) {
      assert.ifError(err)
      assert.ok(buf)
      assert.strictEqual(buf.length, expectedLength)
      done()
    })
  })

  it('should work with {"test":"å"}', function (done) {
    // https://github.com/visionmedia/express/issues/1816

    const stream = new Readable()
    stream.push('{"test":"å"}')
    stream.push(null)

    getRawBody(stream, {
      length: 13
    }, function (err, buf) {
      if (err) return done(err)
      assert.ok(buf)
      assert.strictEqual(buf.length, 13)
      done()
    })
  })

  it('should throw if stream encoding is set', function (done) {
    const stream = new Readable()
    stream.push('akl;sdjfklajsdfkljasdf')
    stream.push(null)
    stream.setEncoding('utf8')

    getRawBody(stream, function (err, buf) {
      assert.strictEqual(err.status, 500)
      done()
    })
  })

  it('should throw when given an invalid encoding', function (done) {
    const stream = new Readable()
    stream.push('akl;sdjfklajsdfkljasdf')
    stream.push(null)

    getRawBody(stream, 'akljsdflkajsdf', function (err) {
      assert.ok(err)
      assert.strictEqual(err.message, 'specified encoding unsupported')
      assert.strictEqual(err.status, 415)
      assert.strictEqual(err.type, 'encoding.unsupported')
      done()
    })
  })

  it('should validate the signal option', function () {
    assert.throws(function () {
      getRawBody(createStream(), { signal: 'nope' }, function () {})
    }, /option signal must be an AbortSignal/)
  })

  it('should abort reading when the signal aborts', function (done) {
    const controller = new AbortController()

    // a stalled stream: only the signal can end this read
    const stream = new Readable({ read () {} })
    stream.push('partial')

    getRawBody(stream, { signal: controller.signal }, function (err) {
      assert.ok(err)
      assert.strictEqual(err.status, 400)
      assert.strictEqual(err.type, 'request.aborted')
      assert.strictEqual(err.received, 7)
      assert.strictEqual(err.cause, controller.signal.reason)
      assert.ok(stream.isPaused())
      done()
    })

    setTimeout(function () { controller.abort() }, 10)
  })

  it('should error immediately when the signal is already aborted', function (done) {
    getRawBody(createStream(), { signal: AbortSignal.abort() }, function (err) {
      assert.ok(err)
      assert.strictEqual(err.status, 400)
      assert.strictEqual(err.type, 'request.aborted')
      done()
    })
  })

  it('should prefer the node stream interface when both are present', function (done) {
    const stream = createStream(Buffer.from('hello, world!'))

    // a wrapper library may decorate a node stream with a
    // web-stream compatibility shim; the node path must win
    stream.getReader = function () {
      throw new Error('getReader should not be called')
    }

    getRawBody(stream, { encoding: true }, function (err, str) {
      assert.ifError(err)
      assert.strictEqual(str, 'hello, world!')
      done()
    })
  })

  it('should not invoke the callback synchronously on early errors', function (done) {
    let returned = false

    getRawBody(createStream(), {
      length,
      limit: length - 1
    }, function (err) {
      assert.strictEqual(returned, true)
      assert.strictEqual(err.type, 'entity.too.large')
      done()
    })

    returned = true
  })

  it('should not defer the callback once reading is asynchronous', function (done) {
    const stream = new EventEmitter()
    let callbackRan = false

    getRawBody(stream, { length: 0, encoding: true }, function (err, str) {
      callbackRan = true
      assert.ifError(err)
      assert.strictEqual(str, '')
    })

    stream.emit('end')

    // the stream already ended, so the callback must not
    // be deferred to a later tick
    assert.strictEqual(callbackRan, true)
    done()
  })

  it('should error on streams1 string chunks without an encoding', function (done) {
    const stream = new EventEmitter()
    stream.unpipe = function () {}

    getRawBody(stream, function (err) {
      assert.ok(err)
      assert.strictEqual(err.code, 'ERR_INVALID_ARG_TYPE')
      done()
    })

    stream.emit('data', 'hello')
    stream.emit('end')
  })

  it('should halt the stream on error, even without pause', function (done) {
    const stream = new EventEmitter()
    stream.unpipe = function () {}

    // keep the listeners attached, so late events reach the handlers
    stream.removeListener = function () { return this }

    let calls = 0

    getRawBody(stream, { limit: 2 }, function (err) {
      calls++
      assert.strictEqual(calls, 1)
      assert.strictEqual(err.status, 413)
      assert.strictEqual(err.type, 'entity.too.large')

      // late events after completion are ignored
      stream.emit('data', Buffer.from('more'))
      stream.emit('aborted')
      stream.emit('end')
      stream.emit('error', new Error('boom'))

      done()
    })

    stream.emit('data', Buffer.from('hello'))
  })

  describe('as a promise', function () {
    it('should work as a promise', function () {
      return getRawBody(createStream())
        .then(checkBuffer)
    })

    it('should work as a promise when length > limit', function () {
      return getRawBody(createStream(), {
        length,
        limit: length - 1
      }).then(throwExpectedError, function (err) {
        assert.strictEqual(err.status, 413)
      })
    })
  })

  describe('with a callback', function () {
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

  describe('with async local storage', function () {
    it('should presist store in callback', function (done) {
      const asyncLocalStorage = new asyncHooks.AsyncLocalStorage()
      const store = { foo: 'bar' }
      const stream = createStream()

      asyncLocalStorage.run(store, function () {
        getRawBody(stream, function (err, buf) {
          if (err) return done(err)
          assert.ok(buf.length > 0)
          assert.strictEqual(asyncLocalStorage.getStore().foo, 'bar')
          done()
        })
      })
    })

    it('should presist store in promise', function (done) {
      const asyncLocalStorage = new asyncHooks.AsyncLocalStorage()
      const store = { foo: 'bar' }
      const stream = createStream()

      asyncLocalStorage.run(store, function () {
        getRawBody(stream).then(function (buf) {
          assert.ok(buf.length > 0)
          assert.strictEqual(asyncLocalStorage.getStore().foo, 'bar')
          done()
        }, done)
      })
    })
  })

  describe('when an encoding is set', function () {
    it('should return a string', function (done) {
      getRawBody(createStream(), {
        encoding: 'utf-8'
      }, function (err, str) {
        assert.ifError(err)
        assert.strictEqual(str, string)
        done()
      })
    })

    it('should handle encoding true as utf-8', function (done) {
      getRawBody(createStream(), {
        encoding: true
      }, function (err, str) {
        assert.ifError(err)
        assert.strictEqual(str, string)
        done()
      })
    })

    it('should handle encoding as options string', function (done) {
      getRawBody(createStream(), 'utf-8', function (err, str) {
        assert.ifError(err)
        assert.strictEqual(str, string)
        done()
      })
    })

    it('should decode codepage string', function (done) {
      const stream = createStream(Buffer.from('bf43f36d6f20657374e1733f', 'hex'))
      const string = '¿Cómo estás?'
      getRawBody(stream, 'iso-8859-1', function (err, str) {
        assert.ifError(err)
        assert.strictEqual(str, string)
        done()
      })
    })

    it('should decode UTF-8 string', function (done) {
      const stream = createStream(Buffer.from('c2bf43c3b36d6f20657374c3a1733f', 'hex'))
      const string = '¿Cómo estás?'
      getRawBody(stream, 'utf-8', function (err, str) {
        assert.ifError(err)
        assert.strictEqual(str, string)
        done()
      })
    })

    it('should decode UTF-16 string (LE BOM)', function (done) {
      // BOM makes this LE
      const stream = createStream(Buffer.from('fffebf004300f3006d006f002000650073007400e10073003f00', 'hex'))
      const string = '¿Cómo estás?'
      getRawBody(stream, 'utf-16', function (err, str) {
        assert.ifError(err)
        assert.strictEqual(str, string)
        done()
      })
    })

    it('should decode UTF-16BE string (BE BOM)', function (done) {
      const stream = createStream(Buffer.from('feff00bf004300f3006d006f002000650073007400e10073003f', 'hex'))
      const string = '¿Cómo estás?'
      getRawBody(stream, 'utf-16be', function (err, str) {
        assert.ifError(err)
        assert.strictEqual(str, string)
        done()
      })
    })

    it('should decode UTF-16LE string', function (done) {
      // UTF-16LE is different from UTF-16 due to BOM behavior
      const stream = createStream(Buffer.from('bf004300f3006d006f002000650073007400e10073003f00', 'hex'))
      const string = '¿Cómo estás?'
      getRawBody(stream, 'utf-16le', function (err, str) {
        assert.ifError(err)
        assert.strictEqual(str, string)
        done()
      })
    })

    it('should reject UTF-32 as unsupported', function (done) {
      // UTF-32 is not part of the WHATWG Encoding Standard
      const stream = createStream(Buffer.from('fffe0000bf00000043000000f30000006d0000006f00000020000000650000007300000074000000e1000000730000003f000000', 'hex'))
      getRawBody(stream, 'utf-32', function (err) {
        assert.ok(err)
        assert.strictEqual(err.status, 415)
        assert.strictEqual(err.type, 'encoding.unsupported')
        done()
      })
    })

    describe('with a custom decoder', function () {
      const iconv = require('iconv-lite')

      it('should validate the decoder option', function () {
        assert.throws(function () {
          getRawBody(createStream(), { encoding: 'utf-8', decoder: 'not a function' })
        }, /option decoder must be a function/)
      })

      it('should error when the decoder throws while writing', function (done) {
        getRawBody(createStream(), {
          encoding: 'utf-8',
          decoder: function () {
            return {
              write () { throw new Error('decoder write failed') },
              end () { return '' }
            }
          }
        }, function (err) {
          assert.ok(err)
          assert.strictEqual(err.message, 'decoder write failed')
          done()
        })
      })

      it('should error when the decoder throws at the end', function (done) {
        getRawBody(createStream(), {
          encoding: 'utf-8',
          decoder: function () {
            return {
              write (chunk) { return '' },
              end () { throw new Error('decoder end failed') }
            }
          }
        }, function (err) {
          assert.ok(err)
          assert.strictEqual(err.message, 'decoder end failed')
          done()
        })
      })

      it('should decode using the custom decoder', function (done) {
        const stream = createStream(Buffer.from('bf43f36d6f20657374e1733f', 'hex'))
        const string = '¿Cómo estás?'
        getRawBody(stream, {
          encoding: 'iso-8859-1',
          decoder: iconv.getDecoder
        }, function (err, str) {
          assert.ifError(err)
          assert.strictEqual(str, string)
          done()
        })
      })

      it('should decode encodings unsupported by TextDecoder', function (done) {
        const string = '¿Cómo estás?'
        const stream = createStream(iconv.encode(string, 'utf-32le'))
        getRawBody(stream, {
          encoding: 'utf-32le',
          decoder: iconv.getDecoder
        }, function (err, str) {
          assert.ifError(err)
          assert.strictEqual(str, string)
          done()
        })
      })

      it('should reject encodings the custom decoder does not support', function (done) {
        const stream = createStream()
        getRawBody(stream, {
          encoding: 'akljsdflkajsdf',
          decoder: iconv.getDecoder
        }, function (err) {
          assert.ok(err)
          assert.strictEqual(err.status, 415)
          assert.strictEqual(err.type, 'encoding.unsupported')
          done()
        })
      })
    })

    it('should correctly calculate the expected length', function (done) {
      const stream = createStream(Buffer.from('{"test":"å"}'))

      getRawBody(stream, {
        encoding: 'utf-8',
        length: 13
      }, done)
    })
  })

  it('should work on streams1 stream', function (done) {
    const stream = new EventEmitter()

    getRawBody(stream, {
      encoding: true,
      length: 19
    }, function (err, value) {
      assert.ifError(err)
      assert.strictEqual(value, 'foobar,foobaz,yay!!')
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
  assert.strictEqual(buf.length, length)
  assert.strictEqual(buf.toString('utf8'), string)
}

function checkString (str) {
  assert.ok(typeof str === 'string')
  assert.strictEqual(str, string)
}

function createStream (buf) {
  if (!buf) return fs.createReadStream(file)

  const stream = new Readable()
  stream._read = function () {
    stream.push(buf)
    stream.push(null)
  }

  return stream
}

function throwExpectedError () {
  throw new Error('expected error')
}
