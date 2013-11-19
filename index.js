var bytes = require('bytes')

module.exports = function (stream, options, done) {
  if (typeof options === 'function') {
    done = options
    options = {}
  } else if (!options) {
    options = {}
  }

  if (!stream._readableState) {
    // dump the stream, though it's probably unnecessary
    if (typeof stream.resume === 'function')
      stream.resume()

    process.nextTick(function () {
      var err = new Error('only readable streams are supported')
      err.status = 500
      done(err)
    })
    return defer
  }

  var limit = null
  if (typeof options.limit === 'number')
    limit = options.limit
  if (typeof options.limit === 'string')
    limit = bytes(options.limit)

  var length = null
  if (!isNaN(options.length))
    length = parseInt(options.length, 10)

  if (limit !== null && length !== null && length > limit) {
    stream.resume() // dump stream
    process.nextTick(function () {
      var err = new Error('request entity too large')
      err.status = 413
      err.length = length
      err.limit = limit
      done(err)
    })
    return defer
  }

  var received = 0
  var buffers = []

  stream.on('data', onData)
  stream.once('end', onEnd)
  stream.once('error', onEnd)
  stream.once('close', cleanup)

  return defer

  function defer(fn) {
    done = fn
  }

  function onData(chunk) {
    buffers.push(chunk)
    received += chunk.length

    if (limit !== null && received > limit) {
      var err = new Error('request entity too large')
      err.status = 413
      err.received = received
      err.limit = limit
      done(err)
      cleanup()
    }
  }

  function onEnd(err) {
    if (err) {
      done(err)
    } else if (length !== null && received !== length) {
      var state = stream._readableState
      if (!state || state.encoding === null) {
        err = new Error('request size did not match content length')
        err.status = 400
        err.received = received
        err.length = length
        done(err)
      } else {
        err = new Error('raw-body expects a buffer stream, but a string chunk was received. please do not set an encoding')
        err.status = 500
        done(err)
      }
    } else {
      done(null, Buffer.concat(buffers))
    }

    cleanup()
  }

  function cleanup() {
    received = buffers = null

    stream.removeListener('data', onData)
    stream.removeListener('end', onEnd)
    stream.removeListener('error', onEnd)
    stream.removeListener('close', cleanup)
  }
}