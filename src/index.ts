/*!
 * raw-body
 * Copyright(c) 2013-2014 Jonathan Ong
 * Copyright(c) 2014-2022 Douglas Christopher Wilson
 * MIT Licensed
 */

import { AsyncResource } from 'node:async_hooks'
import { Readable } from 'node:stream'
import type { ReadableStreamReadResult } from 'node:stream/web'
import bytes from 'bytes'
import createError from 'http-errors'

/**
 * The encoding to decode the body with. `true` decodes as `utf-8`.
 */
export type Encoding = string | true

/**
 * The stream types accepted by `getRawBody`.
 */
export type RawBodyStream = NodeJS.ReadableStream | Readable | ReadableStream<Uint8Array | string>

/**
 * A streaming decoder, turning body chunks into a string.
 */
export interface Decoder {
  write (chunk: Buffer): string
  end (): string | undefined
}

export interface Options {
  /**
   * The expected length of the stream.
   */
  length?: number | string | null
  /**
   * The byte limit of the body. This is the number of bytes or any string
   * format supported by `bytes`, for example `1000`, `'500kb'` or `'3mb'`.
   */
  limit?: number | string | null
  /**
   * The encoding to use to decode the body into a string. By default, a
   * `Buffer` instance will be returned when no encoding is specified. Most
   * likely, you want `utf-8`, so setting encoding to `true` will decode as
   * `utf-8`. You can use any encoding supported by `TextDecoder`.
   * `false` (or any other falsy value) disables decoding, returning
   * a `Buffer`.
   */
  encoding?: Encoding | false | null
  /**
   * A function that receives the encoding and returns the decoder used to
   * turn the body into a string, instead of the built-in `TextDecoder`.
   * Compatible with `iconv-lite`'s `getDecoder`. Throwing signals the
   * encoding is unsupported.
   */
  decoder?: (encoding: string) => Decoder
}

export interface RawBodyError extends Error {
  /**
   * The error code, when there is one, e.g. `ECONNABORTED` for
   * aborted requests.
   */
  code?: string
  /**
   * The limit in bytes.
   */
  limit?: number
  /**
   * The expected length of the stream.
   */
  length?: number
  expected?: number
  /**
   * The received bytes.
   */
  received?: number
  /**
   * The encoding.
   */
  encoding?: string
  /**
   * The corresponding status code for the error. Errors created by
   * `raw-body` always carry one, but errors passed through from the
   * stream or a custom decoder may not.
   */
  status?: number
  statusCode?: number
  /**
   * The error type. Set on every error created by `raw-body`, but
   * absent on errors passed through from the stream or a custom
   * decoder.
   */
  type?: string
}

type Callback<T> = (err: RawBodyError | null, body: T) => void
type InternalCallback = (err?: Error | null, body?: Buffer | string) => void
type CreateDecoder = (encoding: string) => Decoder

// Error.isError is not yet in the TypeScript lib
const nativeIsError = (Error as { isError?: (err: unknown) => err is Error }).isError

const isError: (err: unknown) => err is Error = typeof nativeIsError === 'function'
  ? nativeIsError
  : function (err: unknown): err is Error { return err instanceof Error }

/**
 * Check for the node readable stream interface.
 */

function isNodeReadable (stream: unknown): stream is NodeJS.ReadableStream {
  return typeof (stream as NodeJS.ReadableStream).on === 'function'
}

/**
 * Check for the web ReadableStream interface.
 */

function isWebReadable (stream: unknown): stream is ReadableStream<Uint8Array | string> {
  return typeof (stream as ReadableStream).getReader === 'function'
}

/**
 * Get the decoder for a given encoding.
 */

function getDecoder (encoding: string | undefined | null, createDecoder?: CreateDecoder): Decoder | null {
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
  } catch {
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
 */

function entityTooLargeError (props: { expected?: number, length?: number, limit?: number, received?: number, type?: string }): Error {
  props.type = 'entity.too.large'
  return createError(413, 'request entity too large', props)
}

/**
 * Create a 400 request aborted error.
 */

function abortedError (length: number | null, received: number, cause?: unknown): Error {
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
 */

function sizeMismatchError (length: number, received: number): Error {
  return createError(400, 'request size did not match content length', {
    expected: length,
    length,
    received,
    type: 'request.size.invalid'
  })
}

/**
 * Create a 500 not readable error.
 */

function notReadableError (): Error {
  return createError(500, 'stream is not readable', {
    type: 'stream.not.readable'
  })
}

/**
 * Create a 500 encoding set error.
 */

function encodingSetError (): Error {
  return createError(500, 'stream encoding should not be set', {
    type: 'stream.encoding.set'
  })
}

/**
 * Validate the total received length and assemble the body.
 *
 * @param total exact byte count, when known
 */

function finish (decoder: Decoder | null, buffer: string | Buffer[], length: number | null, received: number, done: InternalCallback, total?: number): void {
  if (length !== null && received !== length) {
    return done(sizeMismatchError(length, received))
  }

  let string: string | Buffer

  try {
    string = decoder
      ? buffer + (decoder.end() || '')
      : Buffer.concat(buffer as Buffer[], total)
  } catch (err) {
    return done(err as Error)
  }

  done(null, string)
}

/**
 * Gets the entire buffer of a stream as a `Buffer`, delivered to the
 * callback. Validates the stream's length against an expected length
 * and maximum limit. Ideal for parsing request bodies.
 */
function getRawBody (stream: RawBodyStream, callback: Callback<Buffer>): void
/**
 * Gets the entire buffer of a stream decoded as a string with the
 * given encoding, delivered to the callback. Validates the stream's
 * length against an expected length and maximum limit. Ideal for
 * parsing request bodies.
 */
function getRawBody (stream: RawBodyStream, options: Readonly<Options & { encoding: Encoding }> | Encoding, callback: Callback<string>): void
/**
 * Gets the entire buffer of a stream as a `Buffer`, delivered to the
 * callback. Validates the stream's length against an expected length
 * and maximum limit. Ideal for parsing request bodies.
 */
function getRawBody (stream: RawBodyStream, options: Readonly<Options> | null, callback: Callback<Buffer>): void
/**
 * Gets the entire buffer of a stream decoded as a string with the
 * given encoding. Validates the stream's length against an expected
 * length and maximum limit. Ideal for parsing request bodies.
 */
function getRawBody (stream: RawBodyStream, options: Readonly<Options & { encoding: Encoding }> | Encoding): Promise<string>
/**
 * Gets the entire buffer of a stream as a `Buffer`. Validates the
 * stream's length against an expected length and maximum limit.
 * Ideal for parsing request bodies.
 */
function getRawBody (stream: RawBodyStream, options?: Readonly<Options> | null): Promise<Buffer>
function getRawBody (stream: RawBodyStream, options?: Readonly<Options> | Encoding | Callback<Buffer> | null, callback?: Callback<Buffer> | Callback<string>): Promise<Buffer | string> | void {
  let done = callback as InternalCallback | undefined
  let opts: Readonly<Options> = (options || {}) as Options

  // light validation
  if (stream === undefined) {
    throw new TypeError('argument stream is required')
  } else if (typeof stream !== 'object' || stream === null ||
    (!isNodeReadable(stream) && !isWebReadable(stream))) {
    throw new TypeError('argument stream must be a stream')
  }

  if (options === true || typeof options === 'string') {
    // short cut for encoding
    opts = {
      encoding: options
    }
  }

  if (typeof options === 'function') {
    done = options as InternalCallback
    opts = {}
  }

  // validate callback is a function, if provided
  if (done !== undefined && typeof done !== 'function') {
    throw new TypeError('argument callback must be a function')
  }

  // get encoding, treating any falsy value as "no decoding"
  const encoding = opts.encoding === true
    ? 'utf-8'
    : (opts.encoding || null)

  // validate decoder is a function, if provided
  if (opts.decoder !== undefined && typeof opts.decoder !== 'function') {
    throw new TypeError('option decoder must be a function')
  }

  // convert the limit to an integer
  const limit = opts.limit == null ? null : bytes.parse(opts.limit)

  // convert the expected length to an integer
  const length = opts.length != null && !Number.isNaN(Number(opts.length))
    ? parseInt(String(opts.length), 10)
    : null

  // select the reader for the stream type.
  // node streams take precedence, so objects exposing both
  // interfaces keep the historical duck-typed behavior
  const read = isNodeReadable(stream)
    ? (callback: InternalCallback) => readStream(stream, encoding, length, limit, opts.decoder, callback)
    : (callback: InternalCallback) => readWebStream(stream, encoding, length, limit, opts.decoder, callback)

  if (done) {
    // classic callback style
    return read(AsyncResource.bind(done, done.name || 'bound-anonymous-fn', null))
  }

  return new Promise(function executor (resolve, reject) {
    read(function onRead (err, buf) {
      if (err) return reject(err)
      resolve(buf as Buffer | string)
    })
  })
}

export default getRawBody
export { getRawBody, getRawBody as 'module.exports' }

/**
 * Halt a stream.
 */

function halt (stream: NodeJS.ReadableStream): void {
  // unpipe everything from the stream
  stream.unpipe()

  // pause stream
  stream.pause()
}

/**
 * Read the data from the stream.
 */

function readStream (stream: NodeJS.ReadableStream & { readableEncoding?: string | null }, encoding: string | undefined | null, length: number | null, limit: number | null, createDecoder: CreateDecoder | undefined, callback: InternalCallback): void {
  let buffer: string | Buffer[] | null
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
  let decoder: Decoder | null

  try {
    decoder = getDecoder(encoding, createDecoder)
  } catch (err) {
    return done(err as Error)
  }

  buffer = decoder
    ? ''
    : []

  // attach listeners
  stream.on('aborted', onAborted)
  stream.on('close', onClose)
  stream.on('data', onData)
  stream.on('end', onEnd)
  stream.on('error', onEnd)

  // mark sync section complete
  sync = false

  function done (...args: Parameters<InternalCallback>): void {
    // mark complete
    complete = true

    if (sync) {
      process.nextTick(invokeCallback)
    } else {
      invokeCallback()
    }

    function invokeCallback (): void {
      cleanup()

      if (args[0]) {
        // halt the stream on error
        halt(stream)
      }

      callback.apply(null, args)
    }
  }

  function onAborted (): void {
    if (complete) return

    done(abortedError(length, received))
  }

  function onClose (): void {
    if (complete) return cleanup()

    // the stream was destroyed before finishing, without emitting
    // an error: surface an aborted request, like the web path,
    // instead of never settling
    done(abortedError(length, received))
  }

  function onData (chunk: Buffer | string): void {
    if (complete) return

    // string chunks mean the stream is already decoded: the
    // readableEncoding assertion covers real streams
    if (typeof chunk === 'string') {
      return done(encodingSetError())
    }

    received += chunk.length

    if (limit !== null && received > limit) {
      done(entityTooLargeError({ limit, received }))
    } else if (decoder) {
      try {
        buffer += decoder.write(chunk)
      } catch (err) {
        done(err as Error)
      }
    } else {
      (buffer as Buffer[]).push(chunk)
    }
  }

  function onEnd (err?: Error): void {
    if (complete) return
    if (err) return done(err)

    finish(decoder, buffer as string | Buffer[], length, received, done)
  }

  function cleanup (): void {
    buffer = null

    stream.removeListener('aborted', onAborted)
    stream.removeListener('data', onData)
    stream.removeListener('end', onEnd)
    stream.removeListener('error', onEnd)
    stream.removeListener('close', onClose)
  }
}

/**
 * Convert a web stream chunk to a Buffer.
 */

function toBuffer (chunk: unknown): Buffer {
  if (typeof chunk === 'string') return Buffer.from(chunk)
  if (Buffer.isBuffer(chunk)) return chunk

  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
  }

  throw new TypeError('stream chunks must be Uint8Array or string')
}

/**
 * Read the data from a web ReadableStream.
 */

function readWebStream (stream: ReadableStream<Uint8Array | string>, encoding: string | undefined | null, length: number | null, limit: number | null, createDecoder: CreateDecoder | undefined, callback: InternalCallback): void {
  let buffer: string | Buffer[] | null
  let reader: ReadableStreamDefaultReader<Uint8Array | string> | null = null

  // check the length and limit options.
  // note: on error the reader lock is released but the stream is
  // not cancelled, so users should handle the stream themselves.
  if (limit !== null && length !== null && length > limit) {
    return fail(entityTooLargeError({ expected: length, length, limit }))
  }

  // reject streams locked to another reader. note: cancelled or
  // fully-read streams cannot be detected portably (no runtime-agnostic
  // access to the disturbed flag) and read as an empty body
  if (stream.locked) {
    return fail(notReadableError())
  }

  let received = 0
  let decoder: Decoder | null

  try {
    decoder = getDecoder(encoding, createDecoder)
  } catch (err) {
    return fail(err as Error)
  }

  buffer = decoder
    ? ''
    : []

  reader = stream.getReader()

  read()

  function read (): void {
    // not .catch: onError must only see read() rejections,
    // never throws from the user callback inside onRead
    reader!.read().then(onRead, onError)
  }

  function onError (err: unknown): void {
    // map aborts (undici's AbortError, node http's ECONNRESET
    // 'aborted') like the node path; other resets pass through
    if (err && ((err as Error).name === 'AbortError' ||
      ((err as NodeJS.ErrnoException).code === 'ECONNRESET' && (err as Error).message === 'aborted'))) {
      return done(abortedError(length, received, err))
    }

    if (isError(err)) {
      return done(err)
    }

    // a web stream may error with any value, or none at all:
    // normalize, so callers always get an Error
    done(new Error('stream error', { cause: err }))
  }

  function fail (err: Error): void {
    // defer, so the callback is never invoked synchronously
    process.nextTick(done, err)
  }

  function done (err?: Error | null, string?: Buffer | string): void {
    buffer = null

    if (reader) {
      // release the stream, so users can handle the rest themselves
      reader.releaseLock()
    }

    callback(err, string)
  }

  function onRead (result: ReadableStreamReadResult<Uint8Array | string>): void {
    // received is an exact byte count on this path
    if (result.done) return finish(decoder, buffer as string | Buffer[], length, received, done, received)

    // a stream of strings is already decoded, so decoding it
    // again with the declared encoding would corrupt the data
    if (decoder && typeof result.value === 'string') {
      return done(encodingSetError())
    }

    let chunk: Buffer

    try {
      chunk = toBuffer(result.value)
    } catch (err) {
      return done(err as Error)
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
          (buffer as Buffer[]).push(Buffer.from(chunk))
        }
      } catch (err) {
        return done(err as Error)
      }

      read()
    }
  }
}
