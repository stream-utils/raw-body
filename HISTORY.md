unreleased
==================

  * Add `signal` option to abort reading the body with an `AbortSignal`;
    aborting produces a 400 `request.aborted` error with the signal's
    reason in `cause`
  * Error with a 400 `request.aborted` when a node stream closes before
    ending, instead of never settling
  * Add support for WHATWG `ReadableStream` (web streams): `fetch`
    `Request`/`Response` bodies, `Blob.stream()`, `TransformStream`
    readables, and `Readable.toWeb()` bridges
    - streams already locked, read, or cancelled error with a 500
      `stream.not.readable`
    - client aborts are mapped to the same 400 `request.aborted` error
      as node streams, with the original error in `cause`
    - string chunks are accepted without an encoding (UTF-8 `Buffer`);
      combined with an encoding they error with a 500
      `stream.encoding.set`, since the stream is already decoded
    - non-byte chunks (e.g. `ArrayBuffer`) error with a `TypeError`
    - on error the reader lock is released, but the stream is not
      cancelled; disposing it is up to the caller
  * Fix process crash when a custom `decoder` throws while reading
    node streams
  * Fix process crash on legacy streams1 emitting string chunks with
    no encoding set; this now errors through the callback
  * deps: remove `unpipe` and use native `stream.unpipe()`
  * deps: remove `iconv-lite` and use native `TextDecoder`
    - Breaking Change: supported encodings are now those of the
      [WHATWG Encoding Standard](https://encoding.spec.whatwg.org/#names-and-labels);
      encodings outside the standard (e.g. UTF-32) now throw a 415 error
    - Breaking Change: `utf-16` no longer detects a big-endian BOM and always
      decodes as little-endian; use `utf-16be` for big-endian content
  * Add `decoder` option to plug in a custom decoder (e.g. `iconv-lite`'s
    `getDecoder`) for encodings outside the WHATWG Encoding Standard
  * Remove the check for a global `Promise` when no callback is provided
  * Breaking Change: Node.js 18.9 is the minimum supported version

3.0.2 / 2025-11-21
======================

  * deps: http-errors@2.0.1
  * deps: use tilde notation for dependencies

3.0.1 / 2025-09-03
==================

  * deps: iconv-lite@0.7.0
    - Avoid false positives in encodingExists by using objects without a prototype
    - Remove compatibility check for StringDecoder.end method
  * Fix the engines field to reflect support for Node >= 0.10

3.0.0 / 2024-07-25
==================

  * deps: iconv-lite@0.6.3
    - Fix HKSCS encoding to prefer Big5 codes
    - Fix minor issue in UTF-32 decoder's endianness detection code
    - Update 'gb18030' encoding to :2005 edition

3.0.0-beta.1 / 2023-02-21
=========================

  * Change TypeScript argument to `NodeJS.ReadableStream` interface
  * Drop support for Node.js 0.8
  * deps: iconv-lite@0.5.2
    - Add encoding cp720
    - Add encoding UTF-32

2.5.2 / 2023-02-21
==================

  * Fix error message for non-stream argument

2.5.1 / 2022-02-28
==================

  * Fix error on early async hooks implementations

2.5.0 / 2022-02-21
==================

  * Prevent loss of async hooks context
  * Prevent hanging when stream is not readable
  * deps: http-errors@2.0.0
    - deps: depd@2.0.0
    - deps: statuses@2.0.1

2.4.3 / 2022-02-14
==================

  * deps: bytes@3.1.2

2.4.2 / 2021-11-16
==================

  * deps: bytes@3.1.1
  * deps: http-errors@1.8.1
    - deps: setprototypeof@1.2.0
    - deps: toidentifier@1.0.1

2.4.1 / 2019-06-25
==================

  * deps: http-errors@1.7.3
    - deps: inherits@2.0.4

2.4.0 / 2019-04-17
==================

  * deps: bytes@3.1.0
    - Add petabyte (`pb`) support
  * deps: http-errors@1.7.2
    - Set constructor name when possible
    - deps: setprototypeof@1.1.1
    - deps: statuses@'>= 1.5.0 < 2'
  * deps: iconv-lite@0.4.24
    - Added encoding MIK

2.3.3 / 2018-05-08
==================

  * deps: http-errors@1.6.3
    - deps: depd@~1.1.2
    - deps: setprototypeof@1.1.0
    - deps: statuses@'>= 1.3.1 < 2'
  * deps: iconv-lite@0.4.23
    - Fix loading encoding with year appended
    - Fix deprecation warnings on Node.js 10+

2.3.2 / 2017-09-09
==================

  * deps: iconv-lite@0.4.19
    - Fix ISO-8859-1 regression
    - Update Windows-1255

2.3.1 / 2017-09-07
==================

  * deps: bytes@3.0.0
  * deps: http-errors@1.6.2
    - deps: depd@1.1.1
  * perf: skip buffer decoding on overage chunk

2.3.0 / 2017-08-04
==================

  * Add TypeScript definitions
  * Use `http-errors` for standard emitted errors
  * deps: bytes@2.5.0
  * deps: iconv-lite@0.4.18
    - Add support for React Native
    - Add a warning if not loaded as utf-8
    - Fix CESU-8 decoding in Node.js 8
    - Improve speed of ISO-8859-1 encoding

2.2.0 / 2017-01-02
==================

  * deps: iconv-lite@0.4.15
    - Added encoding MS-31J
    - Added encoding MS-932
    - Added encoding MS-936
    - Added encoding MS-949
    - Added encoding MS-950
    - Fix GBK/GB18030 handling of Euro character

2.1.7 / 2016-06-19
==================

  * deps: bytes@2.4.0
  * perf: remove double-cleanup on happy path

2.1.6 / 2016-03-07
==================

  * deps: bytes@2.3.0
    - Drop partial bytes on all parsed units
    - Fix parsing byte string that looks like hex

2.1.5 / 2015-11-30
==================

  * deps: bytes@2.2.0
  * deps: iconv-lite@0.4.13

2.1.4 / 2015-09-27
==================

  * Fix masking critical errors from `iconv-lite`
  * deps: iconv-lite@0.4.12
    - Fix CESU-8 decoding in Node.js 4.x

2.1.3 / 2015-09-12
==================

  * Fix sync callback when attaching data listener causes sync read
    - Node.js 0.10 compatibility issue

2.1.2 / 2015-07-05
==================

  * Fix error stack traces to skip `makeError`
  * deps: iconv-lite@0.4.11
    - Add encoding CESU-8

2.1.1 / 2015-06-14
==================

  * Use `unpipe` module for unpiping requests

2.1.0 / 2015-05-28
==================

  * deps: iconv-lite@0.4.10
    - Improved UTF-16 endianness detection
    - Leading BOM is now removed when decoding
    - The encoding UTF-16 without BOM now defaults to UTF-16LE when detection fails

2.0.2 / 2015-05-21
==================

  * deps: bytes@2.1.0
    - Slight optimizations

2.0.1 / 2015-05-10
==================

  * Fix a false-positive when unpiping in Node.js 0.8

2.0.0 / 2015-05-08
==================

  * Return a promise without callback instead of thunk
  * deps: bytes@2.0.1
    - units no longer case sensitive when parsing

1.3.4 / 2015-04-15
==================

  * Fix hanging callback if request aborts during read
  * deps: iconv-lite@0.4.8
    - Add encoding alias UNICODE-1-1-UTF-7

1.3.3 / 2015-02-08
==================

  * deps: iconv-lite@0.4.7
    - Gracefully support enumerables on `Object.prototype`

1.3.2 / 2015-01-20
==================

  * deps: iconv-lite@0.4.6
    - Fix rare aliases of single-byte encodings

1.3.1 / 2014-11-21
==================

  * deps: iconv-lite@0.4.5
    - Fix Windows-31J and X-SJIS encoding support

1.3.0 / 2014-07-20
==================

  * Fully unpipe the stream on error
    - Fixes `Cannot switch to old mode now` error on Node.js 0.10+

1.2.3 / 2014-07-20
==================

  * deps: iconv-lite@0.4.4
    - Added encoding UTF-7

1.2.2 / 2014-06-19
==================

  * Send invalid encoding error to callback

1.2.1 / 2014-06-15
==================

  * deps: iconv-lite@0.4.3
    - Added encodings UTF-16BE and UTF-16 with BOM

1.2.0 / 2014-06-13
==================

  * Passing string as `options` interpreted as encoding
  * Support all encodings from `iconv-lite`

1.1.7 / 2014-06-12
==================

  * use `string_decoder` module from npm

1.1.6 / 2014-05-27
==================

  * check encoding for old streams1
  * support node.js < 0.10.6

1.1.5 / 2014-05-14
==================

  * bump bytes

1.1.4 / 2014-04-19
==================

  * allow true as an option
  * bump bytes

1.1.3 / 2014-03-02
==================

  * fix case when length=null

1.1.2 / 2013-12-01
==================

  * be less strict on state.encoding check

1.1.1 / 2013-11-27
==================

  * add engines

1.1.0 / 2013-11-27
==================

  * add err.statusCode and err.type
  * allow for encoding option to be true
  * pause the stream instead of dumping on error
  * throw if the stream's encoding is set

1.0.1 / 2013-11-19
==================

  * dont support streams1, throw if dev set encoding

1.0.0 / 2013-11-17
==================

  * rename `expected` option to `length`

0.2.0 / 2013-11-15
==================

  * republish

0.1.1 / 2013-11-15
==================

  * use bytes

0.1.0 / 2013-11-11
==================

  * generator support

0.0.3 / 2013-10-10
==================

  * update repo

0.0.2 / 2013-09-14
==================

  * dump stream on bad headers
  * listen to events after defining received and buffers

0.0.1 / 2013-09-14
==================

  * Initial release
