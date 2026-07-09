# raw-body

[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![Node.js Version][node-version-image]][node-version-url]
[![Build status][github-actions-ci-image]][github-actions-ci-url]
[![Test coverage][coveralls-image]][coveralls-url]

Gets the entire buffer of a stream either as a `Buffer` or a string.
Validates the stream's length against an expected length and maximum limit.
Ideal for parsing request bodies.

## Install

This is a [Node.js](https://nodejs.org/en/) module available through the
[npm registry](https://www.npmjs.com/). Installation is done using the
[`npm install` command](https://docs.npmjs.com/getting-started/installing-npm-packages-locally):

```sh
npm install raw-body
```

## API

```js
import getRawBody from 'raw-body'
```

The package is ESM-only. CommonJS consumers can load it with
[`require(esm)`](https://nodejs.org/api/modules.html#loading-ecmascript-modules-using-require),
available in all supported Node.js versions:

```js
const getRawBody = require('raw-body').default
```

### getRawBody(stream, [options], [callback])

**Returns a promise if no callback specified.**

The `stream` argument can be a Node.js readable stream (like an HTTP request)
or a [WHATWG `ReadableStream`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream)
(like the body of a `fetch` `Response`).

Options:

- `length` - The length of the stream.
  If the contents of the stream do not add up to this length,
  an `400` error code is returned.
- `limit` - The byte limit of the body.
  This is the number of bytes or any string format supported by
  [bytes](https://www.npmjs.com/package/bytes),
  for example `1000`, `'500kb'` or `'3mb'`.
  If the body ends up being larger than this limit,
  a `413` error code is returned.
- `encoding` - The encoding to use to decode the body into a string.
  By default, a `Buffer` instance will be returned when no encoding is specified.
  Most likely, you want `utf-8`, so setting `encoding` to `true` will decode as `utf-8`.
  You can use any encoding supported by [`TextDecoder`](https://developer.mozilla.org/en-US/docs/Web/API/Encodings),
  as defined by the [WHATWG Encoding Standard](https://encoding.spec.whatwg.org/#names-and-labels).
- `decoder` - A function that receives the `encoding` and returns the decoder
  used to turn the body into a string, instead of the built-in `TextDecoder`.
  The returned decoder must implement `write(chunk)` and `end()`, both
  returning a string, which is the interface of
  [iconv-lite](https://www.npmjs.org/package/iconv-lite#readme)'s `getDecoder`,
  so it can be passed directly to decode encodings outside the WHATWG standard.
  The chunk is only valid during the `write(chunk)` call: a decoder that
  keeps pending bytes across calls must copy them, as `TextDecoder` and
  iconv-lite do — the underlying memory may be reused afterwards:

```js
import iconv from 'iconv-lite'

getRawBody(stream, {
  encoding: 'utf-32',
  decoder: iconv.getDecoder
})
```

  If the function throws, a `415` error is returned to signal the encoding is
  unsupported.

You can also pass a string in place of options to just specify the encoding.

If an error occurs, the stream will be paused, everything unpiped,
and you are responsible for correctly disposing the stream.
For HTTP requests, you may need to finish consuming the stream if
you want to keep the socket open for future requests. For streams
that use file descriptors, you should `stream.destroy()` or
`stream.close()` to prevent leaks.

For web streams, any reader lock this module acquired is released both
on success and on error, but the stream is never canceled, so on error
you are responsible for disposing it, for example with `stream.cancel()`.

Chunks read from a web stream are collected and assembled once at the
end, without an intermediate copy. This relies on the producer following
the streams contract and not reusing (or mutating) a chunk after it has
been enqueued. Every standard source (a `fetch` `Response`/`Request`
body, `Blob.stream()`, `Readable.toWeb`) satisfies this. If you build a
custom `ReadableStream`, its underlying source must enqueue a fresh
`Uint8Array` for each chunk rather than recycling one scratch buffer,
otherwise the returned body may be corrupted.

## Errors

This module creates errors with `status`/`statusCode`, the received and
expected sizes, and a `type` property for programmatic handling. The full
reference of error attributes and types lives in
[docs/errors.md](https://github.com/stream-utils/raw-body/blob/master/docs/errors.md).

## Examples

Usage examples (Express, Koa, Hono, promises, and TypeScript) live in
[docs/examples.md](https://github.com/stream-utils/raw-body/blob/master/docs/examples.md).

## License

[MIT](LICENSE)

[npm-image]: https://img.shields.io/npm/v/raw-body.svg
[npm-url]: https://npmjs.org/package/raw-body
[node-version-image]: https://img.shields.io/node/v/raw-body.svg
[node-version-url]: https://nodejs.org/en/download/
[coveralls-image]: https://img.shields.io/coveralls/stream-utils/raw-body/master.svg
[coveralls-url]: https://coveralls.io/r/stream-utils/raw-body?branch=master
[downloads-image]: https://img.shields.io/npm/dm/raw-body.svg
[downloads-url]: https://npmjs.org/package/raw-body
[github-actions-ci-image]: https://img.shields.io/github/actions/workflow/status/stream-utils/raw-body/ci.yml?branch=master&label=ci
[github-actions-ci-url]: https://github.com/stream-utils/raw-body/actions/workflows/ci.yml
