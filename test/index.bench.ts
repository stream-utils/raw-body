import { Readable } from 'node:stream'
import { bench, describe } from 'vitest'
import getRawBody, { getRawBodyWeb } from '../src/index.ts'

/**
 * Compares the node stream path against the web stream path with
 * realistic request bodies. Options mirror how body-parser drives
 * raw-body: a byte limit plus the Content-Length as `length`.
 *
 * Run with `npm run bench`.
 */

function makeBody (size: number): Buffer {
  // JSON-looking payload, so string decoding does real work
  const unit = '{"user":"bjohansebas","active":true,"roles":["maintainer"]},'
  return Buffer.from(unit.repeat(Math.ceil(size / unit.length)).slice(0, size))
}

function chunksOf (body: Buffer, chunkSize: number): Buffer[] {
  const chunks: Buffer[] = []

  for (let offset = 0; offset < body.length; offset += chunkSize) {
    chunks.push(body.subarray(offset, offset + chunkSize))
  }

  return chunks
}

function nodeStream (chunks: Buffer[]): Readable {
  return Readable.from(chunks)
}

function webStream (chunks: Buffer[]): ReadableStream<Uint8Array> {
  let index = 0

  return new ReadableStream({
    pull (controller) {
      if (index < chunks.length) {
        const chunk = chunks[index++]
        controller.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.length))
      } else {
        controller.close()
      }
    }
  })
}

interface Scenario {
  name: string
  size: number
  chunkSize: number
  limit: string
}

// chunk sizes match what node's http server delivers: small bodies
// arrive whole, larger ones in 16KB (default highWaterMark) or
// 64KB (socket-sized) chunks
const scenarios: Scenario[] = [
  { name: '1KB JSON (typical API request)', size: 1024, chunkSize: 1024, limit: '100kb' },
  { name: '100KB JSON (body-parser default limit)', size: 100 * 1024, chunkSize: 16 * 1024, limit: '100kb' },
  { name: '5MB upload', size: 5 * 1024 * 1024, chunkSize: 64 * 1024, limit: '10mb' }
]

for (const scenario of scenarios) {
  const body = makeBody(scenario.size)
  const chunks = chunksOf(body, scenario.chunkSize)
  const options = { limit: scenario.limit, length: body.length }
  const stringOptions = { ...options, encoding: 'utf-8' }

  describe(`${scenario.name} -> Buffer`, () => {
    bench('node stream', async () => {
      await getRawBody(nodeStream(chunks), options)
    })

    bench('web stream', async () => {
      await getRawBodyWeb(webStream(chunks), options)
    })
  })

  describe(`${scenario.name} -> utf-8 string`, () => {
    bench('node stream', async () => {
      await getRawBody(nodeStream(chunks), stringOptions)
    })

    bench('web stream', async () => {
      await getRawBodyWeb(webStream(chunks), stringOptions)
    })
  })

  // without a Content-Length the web path cannot preallocate the
  // body and falls back to buffering chunks, like chunked encoding
  describe(`${scenario.name} -> Buffer, unknown length`, () => {
    const noLengthOptions = { limit: scenario.limit }

    bench('node stream', async () => {
      await getRawBody(nodeStream(chunks), noLengthOptions)
    })

    bench('web stream', async () => {
      await getRawBodyWeb(webStream(chunks), noLengthOptions)
    })
  })
}
