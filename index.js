var StringDecoder = require('string_decoder').StringDecoder
var bytes = require('bytes')
var through = require('through2')

module.exports = function (options, done) {  
  if (typeof options === 'function') {
    done = options
    options = {}
  } else if (!options) {
    options = {}
  }

  // convert the limit to an integer
  var limit = null
  if (typeof options.limit === 'number')
    limit = options.limit
  if (typeof options.limit === 'string')
    limit = bytes(options.limit)

  // convert the expected length to an integer
  var length = null
  if (!isNaN(options.length))
    length = parseInt(options.length, 10)

  var stream = through(onData, onEnd)
    
  // check the length and limit options.
  if (limit !== null && length !== null && length > limit) {
    stream.pause()
    process.nextTick(function () {
      var err = makeError('request entity too large', 'entity.too.large')
      err.status = err.statusCode = 413
      err.length = err.expected = length
      err.limit = limit
      done(err)
    })
    return stream
  }

  var state = stream._readableState
  // streams2+: assert the stream encoding is buffer.
  if (state && state.encoding != null) {
    stream.pause()
    process.nextTick(function () {
      var err = makeError('stream encoding should not be set',
        'stream.encoding.set')
      // developer error
      err.status = err.statusCode = 500
      done(err)
    })
    return stream
  }
  
  var received = 0
  // note: we delegate any invalid encodings to the constructor
  var decoder = options.encoding
    ? new StringDecoder(options.encoding === true ? 'utf8' : options.encoding)
    : null
  var buffer = decoder
    ? ''
    : []

  stream.on('error', done)
  
  return stream

  function onData(chunk, enc, next) {
    received += chunk.length
    decoder
      ? buffer += decoder.write(chunk)
      : buffer.push(chunk)

    if (limit !== null && received > limit) {
      stream.pause()
      var err = makeError('request entity too large', 'entity.too.large')
      err.status = err.statusCode = 413
      err.received = received
      err.limit = limit
      done(err)
      cleanup()
    }
    
    next()
  }

  function onEnd(callback) {
    if (length !== null && received !== length) {
      err = makeError('request size did not match content length',
        'request.size.invalid')
      err.status = err.statusCode = 400
      err.received = received
      err.length = err.expected = length
      done(err)
    } else {
      done(null, decoder
        ? buffer + endStringDecoder(decoder)
        : Buffer.concat(buffer)
      )
    }

    cleanup()
    callback()
  }

  function cleanup() {
    received = buffer = null
  }
}

// to create serializable errors you must re-set message so
// that it is enumerable and you must re configure the type
// property so that is writable and enumerable
function makeError(message, type) {
  var error = new Error()
  error.message = message
  Object.defineProperty(error, 'type', {
    value: type,
    enumerable: true,
    writable: true,
    configurable: true
  })
  return error
}

// https://github.com/Raynos/body/blob/2512ced39e31776e5a2f7492b907330badac3a40/index.js#L72
// bug fix for missing `StringDecoder.end` in v0.8.x
function endStringDecoder(decoder) {
    if (decoder.end) {
        return decoder.end()
    }

    var res = ""

    if (decoder.charReceived) {
        var cr = decoder.charReceived
        var buf = decoder.charBuffer
        var enc = decoder.encoding
        res += buf.slice(0, cr).toString(enc)
    }

    return res
}
