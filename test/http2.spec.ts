import assert from 'node:assert'
import http2 from 'node:http2'
import net from 'node:net'
import { describe, it } from 'vitest'
import getRawBody from '../src/index.ts'
import { withDone } from './support/with-done.ts'

describe('using http2 streams', function () {
  it('should read from compatibility api', withDone(function (done) {
    const server = http2.createServer(function onRequest (req, res) {
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
      const session = http2.connect('http://localhost:' + addr.port)
      const request = session.request({ ':method': 'POST', ':path': '/' })

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
  }))

  it('should read body streams', withDone(function (done) {
    const server = http2.createServer()

    server.on('stream', function onStream (stream: http2.ServerHttp2Stream, headers: http2.IncomingHttpHeaders) {
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
      const addr = server.address() as net.AddressInfo
      const session = http2.connect('http://localhost:' + addr.port)
      const request = session.request({ ':method': 'POST', ':path': '/' })

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
  }))

  it('should throw if stream encoding is set', withDone(function (done) {
    const server = http2.createServer(function onRequest (req, res) {
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
      const session = http2.connect('http://localhost:' + addr.port)
      const request = session.request({ ':method': 'POST', ':path': '/' })

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
  }))

  it('should throw if connection ends', withDone(function (done) {
    let socket: net.Socket
    const server = http2.createServer(function onRequest (req) {
      getRawBody(req, { length: req.headers['content-length'] }, function (err) {
        server.close()
        assert.ok(err)
        assert.strictEqual((err as NodeJS.ErrnoException).code, 'ECONNABORTED')
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
      const session = http2.connect('http://localhost:' + addr.port, {
        createConnection: function (authority: URL) {
          return (socket = net.connect(Number(authority.port), authority.hostname))
        }
      })

      const request = session.request({
        ':method': 'POST',
        ':path': '/',
        'content-length': '50'
      })

      request.write('testing...')
    })
  }))
})

function http2close (server: http2.Http2Server, session: http2.ClientHttp2Session, callback: () => void): void {
  session.close(onSessionClose)

  function onServerClose (): void {
    callback()
  }

  function onSessionClose (): void {
    server.close(onServerClose)
  }
}
