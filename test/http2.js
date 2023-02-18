var assert = require('assert')
var getRawBody = require('..')
var http2 = tryRequire('http2')
var net = require('net')

var describeHttp2 = !http2
  ? describe.skip
  : describe

describeHttp2('using http2 streams', function () {
  it('should read from compatibility api', function (done) {
    var server = http2.createServer(function onRequest (req, res) {
      getRawBody(req, { length: req.headers['content-length'] }, function (err, body) {
        if (err) {
          req.resume()
          res.statusCode = 500
          return res.end(err.message)
        }

        res.end(body)
      })
    })

    server.listen(function onListen () {
      var addr = server.address()
      var session = http2.connect('http://localhost:' + addr.port)
      var request = session.request({ ':method': 'POST', ':path': '/' })

      request.end('hello, world!')

      request.on('response', function onResponse (headers) {
        getRawBody(request, { encoding: true }, function (err, str) {
          http2close(server, session, function onClose () {
            assert.ifError(err)
            assert.strictEqual(headers[':status'], 200)
            assert.strictEqual(str, 'hello, world!')
            done()
          })
        })
      })
    })
  })

  it('should read body streams', function (done) {
    var server = http2.createServer()

    server.on('stream', function onStream (stream, headers) {
      getRawBody(stream, { length: headers['content-length'] }, function (err, body) {
        if (err) {
          stream.resume()
          stream.respond({ ':status': 500 })
          stream.end(err.message)
          return
        }

        stream.end(body)
      })
    })

    server.listen(function onListen () {
      var addr = server.address()
      var session = http2.connect('http://localhost:' + addr.port)
      var request = session.request({ ':method': 'POST', ':path': '/' })

      request.end('hello, world!')

      request.on('response', function onResponse (headers) {
        getRawBody(request, { encoding: true }, function (err, str) {
          http2close(server, session, function onClose () {
            assert.ifError(err)
            assert.strictEqual(headers[':status'], 200)
            assert.strictEqual(str, 'hello, world!')
            done()
          })
        })
      })
    })
  })

  it('should throw if stream encoding is set', function (done) {
    var server = http2.createServer(function onRequest (req, res) {
      req.setEncoding('utf8')
      getRawBody(req, { length: req.headers['content-length'] }, function (err, body) {
        if (err) {
          req.resume()
          res.statusCode = 500
          return res.end(err.message)
        }

        res.end(body)
      })
    })

    server.listen(function onListen () {
      var addr = server.address()
      var session = http2.connect('http://localhost:' + addr.port)
      var request = session.request({ ':method': 'POST', ':path': '/' })

      request.end('hello, world!')

      request.on('response', function onResponse (headers) {
        getRawBody(request, { encoding: true }, function (err, str) {
          http2close(server, session, function onClose () {
            assert.ifError(err)
            assert.strictEqual(headers[':status'], 500)
            assert.strictEqual(str, 'stream encoding should not be set')
            done()
          })
        })
      })
    })
  })

  it('should throw if connection ends', function (done) {
    var socket
    var server = http2.createServer(function onRequest (req, res) {
      getRawBody(req, { length: req.headers['content-length'] }, function (err, body) {
        server.close()
        assert.ok(err)
        assert.strictEqual(err.code, 'ECONNABORTED')
        assert.strictEqual(err.expected, 50)
        assert.strictEqual(err.message, 'request aborted')
        assert.strictEqual(err.received, 10)
        assert.strictEqual(err.status, 400)
        assert.strictEqual(err.type, 'request.aborted')
        done()
      })

      setTimeout(socket.destroy.bind(socket), 10)
    })

    server.listen(function onListen () {
      var addr = server.address()
      var session = http2.connect('http://localhost:' + addr.port, {
        createConnection: function (authority) {
          return (socket = net.connect(authority.port, authority.hostname))
        }
      })

      var request = session.request({
        ':method': 'POST',
        ':path': '/',
        'content-length': '50'
      })

      request.write('testing...')
    })
  })
})

function http2close (server, session, callback) {
  if (typeof session.close === 'function') {
    session.close(onSessionClose)
  } else {
    session.shutdown(onSessionClose)
  }

  function onServerClose () {
    callback()
  }

  function onSessionClose () {
    server.close(onServerClose)
  }
}

function tryRequire (module) {
  try {
    return require(module)
  } catch (e) {
    return undefined
  }
}
