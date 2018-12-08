var assert = require('assert')
var getRawBody = require('..')
var http = require('http')
var net = require('net')

describe('using http streams', function () {
  it('should read body streams', function (done) {
    var server = http.createServer(function onRequest (req, res) {
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
      var client = http.request({method: 'POST', port: addr.port})

      client.end('hello, world!')

      client.on('response', function onResponse (res) {
        getRawBody(res, { encoding: true }, function (err, str) {
          server.close(function onClose () {
            assert.ifError(err)
            assert.strictEqual(str, 'hello, world!')
            done()
          })
        })
      })
    })
  })

  it('should throw if stream encoding is set', function (done) {
    var server = http.createServer(function onRequest (req, res) {
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
      var client = http.request({method: 'POST', port: addr.port})

      client.end('hello, world!')

      client.on('response', function onResponse (res) {
        getRawBody(res, { encoding: true }, function (err, str) {
          server.close(function onClose () {
            assert.ifError(err)
            assert.strictEqual(str, 'stream encoding should not be set')
            done()
          })
        })
      })
    })
  })

  it('should throw if connection ends', function (done) {
    var socket
    var server = http.createServer(function onRequest (req, res) {
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
      socket = net.connect(server.address().port, function () {
        socket.write('POST / HTTP/1.0\r\n')
        socket.write('Connection: keep-alive\r\n')
        socket.write('Content-Length: 50\r\n')
        socket.write('\r\n')
        socket.write('testing...')
      })
    })
  })
})
