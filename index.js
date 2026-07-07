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
const bytes = require('bytes')
const createError = require('http-errors')

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
  } else if (typeof stream !== 'object' || stream === null || typeof stream.on !== 'function') {
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

  if (done) {
    // classic callback style
    return readStream(stream, encoding, length, limit, opts.decoder, AsyncResource.bind(done, done.name || 'bound-anonymous-fn', null))
  }

  return new Promise(function executor (resolve, reject) {
    readStream(stream, encoding, length, limit, opts.decoder, function onRead (err, buf) {
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
    return done(createError(413, 'request entity too large', {
      expected: length,
      length,
      limit,
      type: 'entity.too.large'
    }))
  }

  // assert the stream encoding is buffer.
  if (stream.readableEncoding) {
    // developer error
    return done(createError(500, 'stream encoding should not be set', {
      type: 'stream.encoding.set'
    }))
  }

  if (typeof stream.readable !== 'undefined' && !stream.readable) {
    return done(createError(500, 'stream is not readable', {
      type: 'stream.not.readable'
    }))
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

    done(createError(400, 'request aborted', {
      code: 'ECONNABORTED',
      expected: length,
      length,
      received,
      type: 'request.aborted'
    }))
  }

  function onData (chunk) {
    if (complete) return

    received += chunk.length

    if (limit !== null && received > limit) {
      done(createError(413, 'request entity too large', {
        limit,
        received,
        type: 'entity.too.large'
      }))
    } else if (decoder) {
      // streams1 may emit string chunks
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      buffer += decoder.write(buf)
    } else {
      buffer.push(chunk)
    }
  }

  function onEnd (err) {
    if (complete) return
    if (err) return done(err)

    if (length !== null && received !== length) {
      done(createError(400, 'request size did not match content length', {
        expected: length,
        length,
        received,
        type: 'request.size.invalid'
      }))
    } else {
      const string = decoder
        ? buffer + (decoder.end() || '')
        : Buffer.concat(buffer)
      done(null, string)
    }
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
