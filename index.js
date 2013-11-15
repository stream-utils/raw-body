var bytes = require('bytes')

module.exports = function (stream, options, done) {
  if (typeof options === 'function') {
    done = options
    options = {}
  } else if (!options) {
    options = {}
  }

  var limit = null
  if (typeof options.limit === 'number')
    limit = options.limit
  if (typeof options.limit === 'string')
    limit = bytes(options.limit)

  var expected = null
  if (!isNaN(options.expected))
    expected = parseInt(options.expected, 10)

  if (limit !== null && expected !== null && expected > limit) {
    var err = new Error('request entity too large')
    err.status = 413
    err.expected = expected
    err.limit = limit
    stream.resume() // dump stream
    process.nextTick(function () {
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

  function onEnd() {
    if (expected !== null && received !== expected) {
      var err = new Error('request size did not match content length')
      err.status = 400
      err.received = received
      err.expected = expected
      done(err)
    } else {
      done(null, Buffer.concat(buffers))
    }

    cleanup()
  }

  function cleanup() {
    received = buffers = null

    stream.removeListener('data', onData)
    stream.removeListener('end', onEnd)
    stream.removeListener('error', done)
    stream.removeListener('error', cleanup)
    stream.removeListener('close', cleanup)
  }
}