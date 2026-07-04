// Worker thread that runs a single rrule-ts expand() per message.
//
// The sweep runs this in a worker so it can enforce a per-case wall-clock
// timeout: a degenerate sub-daily rule (e.g. SECONDLY with a BYSECOND that the
// INTERVAL stepping can never reach) makes the engine grind through its full
// ~200-year forward-scan horizon, which can take over a minute. dateutil
// detects such rules instantly and raises "empty set", so without a timeout the
// sweep would stall on cases dateutil already flagged. Timeouts are surfaced as
// a distinct TS_TIMEOUT bucket rather than silently dropped.

import { parentPort } from 'node:worker_threads'
import { setTemporal, parse, expand } from 'rrule-ts'
import { Temporal } from 'temporal-polyfill'

setTemporal(Temporal as unknown as typeof globalThis.Temporal)

interface WorkerRequest {
  id: string
  rrule: string
  dtstart: string
  tzid: string | null
  count: number
}

interface WorkerResponse {
  id: string
  occurrences: string[]
  error: string | null
}

function formatOccurrence(occ: unknown): string {
  return String((occ as { toString(): string }).toString()).replace(/\[.*\]$/, '')
}

parentPort?.on('message', (c: WorkerRequest) => {
  let response: WorkerResponse
  try {
    const dtstartBasic = c.dtstart.replace(/[-:]/g, '')
    const dtLine = c.tzid ? `DTSTART;TZID=${c.tzid}:${dtstartBasic}` : `DTSTART:${dtstartBasic}`
    const parsed = parse(`${dtLine}\nRRULE:${c.rrule}`)
    if (!parsed.ok) {
      response = { id: c.id, occurrences: [], error: `parse error: ${String(parsed.error)}` }
    } else {
      const occs = expand(parsed.value, c.count)
      response = { id: c.id, occurrences: occs.map(formatOccurrence), error: null }
    }
  } catch (err: unknown) {
    response = {
      id: c.id,
      occurrences: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
  parentPort?.postMessage(response)
})
