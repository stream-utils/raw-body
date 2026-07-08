/*!
 * raw-body
 * Copyright(c) 2013-2014 Jonathan Ong
 * Copyright(c) 2014-2022 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * Module dependencies.
 * @private
 */

const { AsyncResource } = require('async_hooks')
const { isDisturbed } = require('stream')
const bytes = require('bytes')
const createError = require('http-errors')

/**
 * Check if a value is an Error.
 * @private
 */

const isError = typeof Error.isError === 'function'
  ? Error.isError
  : function (err) { return err instanceof Error }

/**
 * Module exports.
 * @public
 */

module.exports = getRawBody

/**
 * Get the decoder for a given encoding.
 *
 * @param {string} encoding
 * @param {function} [createDecoder]
 * @private
 */

function getDecoder (encoding, createDecoder) {
  if (!encoding) return null

  try {
    if (createDecoder) return createDecoder(encoding)

    const decoder = new TextDecoder(encoding)

    return {
      write (chunk) {
        return decoder.decode(chunk, { stream: true })
      },
      end () {
        return decoder.decode()
      }
    }
  } catch (e) {
    // the encoding was not found
    throw createError(415, 'specified encoding unsupported', {
      encoding,
      type: 'encoding.unsupported'
    })
  }
}

/**
 * Create a 413 entity too large error. The properties differ
 * between the early length check and the streamed limit check.
 *
 * @param {object} props
 * @private
 */

function entityTooLargeError (props) {
  props.type = 'entity.too.large'
  return createError(413, 'request entity too large', props)
}

/**
 * Create a 400 request aborted error.
 *
 * @param {number} length
 * @param {number} received
 * @param {Error} [cause]
 * @private
 */

function abortedError (length, received, cause) {
  const err = createError(400, 'request aborted', {
    code: 'ECONNABORTED',
    expected: length,
    length,
    received,
    type: 'request.aborted'
  })

  if (cause !== undefined) {
    err.cause = cause
  }

  return err
}

/**
 * Create a 400 size mismatch error.
 *
 * @param {number} length
 * @param {number} received
 * @private
 */

function sizeMismatchError (length, received) {
  return createError(400, 'request size did not match content length', {
    expected: length,
    length,
    received,
    type: 'request.size.invalid'
  })
}

/**
 * Create a 500 not readable error.
 *
 * @private
 */

function notReadableError () {
  return createError(500, 'stream is not readable', {
    type: 'stream.not.readable'
  })
}

/**
 * Create a 500 encoding set error.
 *
 * @private
 */

function encodingSetError () {
  return createError(500, 'stream encoding should not be set', {
    type: 'stream.encoding.set'
  })
}

/**
 * Validate the total received length and assemble the body.
 *
 * @param {object} decoder
 * @param {string|Array} buffer
 * @param {number} length
 * @param {number} received
 * @param {function} done
 * @param {number} [total] exact byte count, when known
 * @private
 */

function finish (decoder, buffer, length, received, done, total) {
  if (length !== null && received !== length) {
    return done(sizeMismatchError(length, received))
  }

  let string

  try {
    string = decoder
      ? buffer + (decoder.end() || '')
      : Buffer.concat(buffer, total)
  } catch (err) {
    return done(err)
  }

  done(null, string)
}

/**
 * Get the raw body of a stream (typically HTTP).
 *
 * @param {object} stream
 * @param {object|string|function} [options]
 * @param {function} [callback]
 * @public
 */

function getRawBody (stream, options, callback) {
  let done = callback
  let opts = options || {}

  // light validation
  if (stream === undefined) {
    throw new TypeError('argument stream is required')
  } else if (typeof stream !== 'object' || stream === null ||
    (typeof stream.on !== 'function' && typeof stream.getReader !== 'function')) {
    throw new TypeError('argument stream must be a stream')
  }

  if (options === true || typeof options === 'string') {
    // short cut for encoding
    opts = {
      encoding: options
    }
  }

  if (typeof options === 'function') {
    done = options
    opts = {}
  }

  // validate callback is a function, if provided
  if (done !== undefined && typeof done !== 'function') {
    throw new TypeError('argument callback must be a function')
  }

  // get encoding
  const encoding = opts.encoding !== true
    ? opts.encoding
    : 'utf-8'

  // validate decoder is a function, if provided
  if (opts.decoder !== undefined && typeof opts.decoder !== 'function') {
    throw new TypeError('option decoder must be a function')
  }

  // convert the limit to an integer
  const limit = bytes.parse(opts.limit)

  // convert the expected length to an integer
  const length = opts.length != null && !isNaN(opts.length)
    ? parseInt(opts.length, 10)
    : null

  // select the reader for the stream type.
  // node streams take precedence, so objects exposing both
  // interfaces keep the historical duck-typed behavior
  const read = typeof stream.on === 'function'
    ? readStream
    : readWebStream

  if (done) {
    // classic callback style
    return read(stream, encoding, length, limit, opts.decoder, AsyncResource.bind(done, done.name || 'bound-anonymous-fn', null))
  }

  return new Promise(function executor (resolve, reject) {
    read(stream, encoding, length, limit, opts.decoder, function onRead (err, buf) {
      if (err) return reject(err)
      resolve(buf)
    })
  })
}

/**
 * Halt a stream.
 *
 * @param {Object} stream
 * @private
 */

function halt (stream) {
  // unpipe everything from the stream
  stream.unpipe()

  // pause stream
  if (typeof stream.pause === 'function') {
    stream.pause()
  }
}

/**
 * Read the data from the stream.
 *
 * @param {object} stream
 * @param {string} encoding
 * @param {number} length
 * @param {number} limit
 * @param {function} createDecoder
 * @param {function} callback
 * @public
 */

function readStream (stream, encoding, length, limit, createDecoder, callback) {
  let buffer
  let complete = false
  let sync = true

  // check the length and limit options.
  // note: we intentionally leave the stream paused,
  // so users should handle the stream themselves.
  if (limit !== null && length !== null && length > limit) {
    return done(entityTooLargeError({ expected: length, length, limit }))
  }

  // assert the stream encoding is buffer.
  if (stream.readableEncoding) {
    // developer error
    return done(encodingSetError())
  }

  if (typeof stream.readable !== 'undefined' && !stream.readable) {
    return done(notReadableError())
  }

  let received = 0
  let decoder

  try {
    decoder = getDecoder(encoding, createDecoder)
  } catch (err) {
    return done(err)
  }

  buffer = decoder
    ? ''
    : []

  // attach listeners
  stream.on('aborted', onAborted)
  stream.on('close', cleanup)
  stream.on('data', onData)
  stream.on('end', onEnd)
  stream.on('error', onEnd)

  // mark sync section complete
  sync = false

  function done () {
    const args = new Array(arguments.length)

    // copy arguments
    for (let i = 0; i < args.length; i++) {
      args[i] = arguments[i]
    }

    // mark complete
    complete = true

    if (sync) {
      process.nextTick(invokeCallback)
    } else {
      invokeCallback()
    }

    function invokeCallback () {
      cleanup()

      if (args[0]) {
        // halt the stream on error
        halt(stream)
      }

      callback.apply(null, args)
    }
  }

  function onAborted () {
    if (complete) return

    done(abortedError(length, received))
  }

  function onData (chunk) {
    if (complete) return

    received += chunk.length

    if (limit !== null && received > limit) {
      done(entityTooLargeError({ limit, received }))
    } else if (decoder) {
      // streams1 may emit string chunks
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk

      try {
        buffer += decoder.write(buf)
      } catch (err) {
        done(err)
      }
    } else {
      buffer.push(chunk)
    }
  }

  function onEnd (err) {
    if (complete) return
    if (err) return done(err)

    finish(decoder, buffer, length, received, done)
  }

  function cleanup () {
    buffer = null

    stream.removeListener('aborted', onAborted)
    stream.removeListener('data', onData)
    stream.removeListener('end', onEnd)
    stream.removeListener('error', onEnd)
    stream.removeListener('close', cleanup)
  }
}

/**
 * Convert a web stream chunk to a Buffer.
 *
 * @param {*} chunk
 * @private
 */

function toBuffer (chunk) {
  if (typeof chunk === 'string') return Buffer.from(chunk)
  if (Buffer.isBuffer(chunk)) return chunk

  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  }

  throw new TypeError('stream chunks must be Uint8Array or string')
}

/**
 * Read the data from a web ReadableStream.
 *
 * @param {ReadableStream} stream
 * @param {string} encoding
 * @param {number} length
 * @param {number} limit
 * @param {function} createDecoder
 * @param {function} callback
 * @private
 */

function readWebStream (stream, encoding, length, limit, createDecoder, callback) {
  let buffer
  let reader = null

  // check the length and limit options.
  // note: on error the reader lock is released but the stream is
  // not cancelled, so users should handle the stream themselves.
  if (limit !== null && length !== null && length > limit) {
    return fail(entityTooLargeError({ expected: length, length, limit }))
  }

  // reject streams locked to another reader, and streams
  // already read or cancelled (disturbed)
  if (stream.locked || isDisturbed(stream)) {
    return fail(notReadableError())
  }

  let received = 0
  let decoder

  try {
    decoder = getDecoder(encoding, createDecoder)
  } catch (err) {
    return fail(err)
  }

  buffer = decoder
    ? ''
    : []

  reader = stream.getReader()

  read()

  function read () {
    // not .catch: onError must only see read() rejections,
    // never throws from the user callback inside onRead
    reader.read().then(onRead, onError)
  }

  function onError (err) {
    // map aborts (undici's AbortError, node http's ECONNRESET
    // 'aborted') like the node path; other resets pass through
    if (err && (err.name === 'AbortError' ||
      (err.code === 'ECONNRESET' && err.message === 'aborted'))) {
      return done(abortedError(length, received, err))
    }

    if (isError(err)) {
      return done(err)
    }

    // a web stream may error with any value, or none at all:
    // normalize, so callers always get an Error
    done(new Error('stream error', { cause: err }))
  }

  function fail (err) {
    // defer, so the callback is never invoked synchronously
    process.nextTick(done, err)
  }

  function done (err, string) {
    buffer = null

    if (reader) {
      // release the stream, so users can handle the rest themselves
      reader.releaseLock()
    }

    callback(err, string)
  }

  function onRead (result) {
    // received is an exact byte count on this path
    if (result.done) return finish(decoder, buffer, length, received, done, received)

    // a stream of strings is already decoded, so decoding it
    // again with the declared encoding would corrupt the data
    if (decoder && typeof result.value === 'string') {
      return done(encodingSetError())
    }

    let chunk

    try {
      chunk = toBuffer(result.value)
    } catch (err) {
      return done(err)
    }

    received += chunk.length

    if (limit !== null && received > limit) {
      done(entityTooLargeError({ limit, received }))
    } else {
      try {
        if (decoder) {
          // consumed immediately: the zero-copy view is safe
          buffer += decoder.write(chunk)
        } else {
          // copy: the producer may reuse the chunk's memory
          buffer.push(Buffer.from(chunk))
        }
      } catch (err) {
        return done(err)
      }

      read()
    }
  }
}
