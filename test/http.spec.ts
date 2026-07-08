import assert from 'node:assert'
import http from 'node:http'
import net from 'node:net'
import { describe, it } from 'vitest'
import getRawBody from '../src/index.ts'
import { withDone } from './support/with-done.ts'

describe('using http streams', function () {
  it('should read body streams', withDone(function (done) {
    const server = http.createServer(function onRequest (req, res) {
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
      const addr = server.address() as net.AddressInfo
      const client = http.request({ method: 'POST', port: addr.port })

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
  }))

  it('should throw if stream encoding is set', withDone(function (done) {
    const server = http.createServer(function onRequest (req, res) {
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
      const addr = server.address() as net.AddressInfo
      const client = http.request({ method: 'POST', port: addr.port })

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
  }))

  it('should throw if stream is not readable', withDone(function (done) {
    const server = http.createServer(function onRequest (req, res) {
      getRawBody(req, { length: req.headers['content-length'] }, function (err) {
        if (err) {
          req.resume()
          res.statusCode = 500
          res.end(err.message)
          return
        }

        getRawBody(req, { length: req.headers['content-length'] }, function (err) {
          if (err) {
            res.statusCode = 500
            res.end('[' + err.type + '] ' + err.message)
          } else {
            res.statusCode = 200
            res.end()
          }
        })
      })
    })

    server.listen(function onListen () {
      const addr = server.address() as net.AddressInfo
      const client = http.request({ method: 'POST', port: addr.port })

      client.end('hello, world!')

      client.on('response', function onResponse (res) {
        getRawBody(res, { encoding: true }, function (err, str) {
          server.close(function onClose () {
            assert.ifError(err)
            assert.strictEqual(str, '[stream.not.readable] stream is not readable')
            done()
          })
        })
      })
    })
  }))

  it('should throw if connection ends', withDone(function (done) {
    let socket: net.Socket
    const server = http.createServer(function onRequest (req) {
      getRawBody(req, { length: req.headers['content-length'] }, function (err) {
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
      const addr = server.address() as net.AddressInfo
      socket = net.connect({ port: addr.port }, function () {
        socket.write('POST / HTTP/1.0\r\n')
        socket.write('Connection: keep-alive\r\n')
        socket.write('Content-Length: 50\r\n')
        socket.write('\r\n')
        socket.write('testing...')
      })
    })
  }))
})
