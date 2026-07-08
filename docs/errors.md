# Errors

This module creates errors depending on the error condition during reading.
The error may be an error from the underlying Node.js implementation, but is
otherwise an error created by this module, which has the following attributes:

  * `limit` - the limit in bytes
  * `length` and `expected` - the expected length of the stream
  * `received` - the received bytes
  * `encoding` - the invalid encoding
  * `status` and `statusCode` - the corresponding status code for the error
  * `type` - the error type
  * `cause` - the underlying error, when the error wraps another one
    (for example an aborted web stream)

## Types

The errors from this module have a `type` property which allows for the programmatic
determination of the type of error returned.

### encoding.unsupported

This error will occur when the `encoding` option is specified, but the value does
not map to an encoding supported by [`TextDecoder`](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder).

### entity.too.large

This error will occur when the `limit` option is specified, but the stream has
an entity that is larger.

### request.aborted

This error will occur when the request stream is aborted by the client before
reading the body has finished.

### request.size.invalid

This error will occur when the `length` option is specified, but the stream has
emitted more bytes.

### stream.encoding.set

This error will occur when the given stream has an encoding set on it, making it
a decoded stream. The stream should not have an encoding set and is expected to
emit `Buffer` objects. For web streams, this occurs when the stream yields
string chunks while an encoding is set — the stream is already decoded, so
decoding it again would corrupt the data. (Without an encoding, string
chunks are accepted and encoded as UTF-8 into the returned `Buffer`.)

### stream.not.readable

This error will occur when the given stream is not readable, or, for a web
stream, when it is locked to another reader. A web stream that was already
read or cancelled cannot be detected portably across runtimes and reads as
an empty body.
