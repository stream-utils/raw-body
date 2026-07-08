# Examples

## Simple Express example

```js
import contentType from 'content-type'
import express from 'express'
import getRawBody from 'raw-body'

const app = express()

app.use(function (req, res, next) {
  getRawBody(req, {
    length: req.headers['content-length'],
    limit: '1mb',
    encoding: contentType.parse(req).parameters.charset
  }, function (err, string) {
    if (err) return next(err)
    req.text = string
    next()
  })
})

// now access req.text
```

## Simple Koa example

```js
import contentType from 'content-type'
import getRawBody from 'raw-body'
import koa from 'koa'

const app = koa()

app.use(function * (next) {
  this.text = yield getRawBody(this.req, {
    length: this.req.headers['content-length'],
    limit: '1mb',
    encoding: contentType.parse(this.req).parameters.charset
  })
  yield next
})

// now access this.text
```

## Simple Hono example

Hono's request is a `fetch` `Request`, so its body is a WHATWG
`ReadableStream` and can be read directly:

```js
import { Hono } from 'hono'
import getRawBody from 'raw-body'

const app = new Hono()

app.post('/', async (c) => {
  try {
    const text = await getRawBody(c.req.raw.body, {
      length: c.req.header('content-length'),
      limit: '1mb',
      encoding: 'utf-8'
    })
    return c.text(`${text.length} characters received`)
  } catch (err) {
    return c.text(err.message, err.status || 500)
  }
})

export default app
```

## Using as a promise

To use this library as a promise, simply omit the `callback` and a promise is
returned.

```js
import getRawBody from 'raw-body'
import http from 'node:http'

const server = http.createServer(function (req, res) {
  getRawBody(req)
    .then(function (buf) {
      res.statusCode = 200
      res.end(buf.length + ' bytes submitted')
    })
    .catch(function (err) {
      res.statusCode = 500
      res.end(err.message)
    })
})

server.listen(3000)
```

## Using with TypeScript

```ts
import getRawBody from 'raw-body';
import * as http from 'node:http';

const server = http.createServer((req, res) => {
  getRawBody(req)
  .then((buf) => {
    res.statusCode = 200;
    res.end(buf.length + ' bytes submitted');
  })
  .catch((err) => {
    res.statusCode = err.statusCode;
    res.end(err.message);
  });
});

server.listen(3000);
```
