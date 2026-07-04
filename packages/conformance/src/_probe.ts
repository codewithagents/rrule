// Temporary diagnostic (not committed): three-way BYWEEKNO year-boundary probe.
import { setTemporal, parse, expand } from 'rrule-ts'
import { Temporal } from 'temporal-polyfill'
import { execFileSync } from 'node:child_process'
import { runRRuleJs } from './rrulejs-oracle.js'

setTemporal(Temporal as unknown as typeof globalThis.Temporal)

interface C {
  id: string
  label: string
  rrule: string
  dtstart: string
  tzid: string | null
  count: number
}

const cases: C[] = [
  {
    id: 'a',
    label: 'BYWEEKNO=52 @2000-01-01 (Sat)',
    rrule: 'FREQ=YEARLY;BYWEEKNO=52',
    dtstart: '2000-01-01T09:00:00',
    tzid: null,
    count: 9,
  },
  {
    id: 'b',
    label: 'BYWEEKNO=1 @2000-01-01 (Sat)',
    rrule: 'FREQ=YEARLY;BYWEEKNO=1',
    dtstart: '2000-01-01T09:00:00',
    tzid: null,
    count: 8,
  },
  {
    id: 'c',
    label: 'BYWEEKNO=1 @2016-01-01 (Fri)',
    rrule: 'FREQ=YEARLY;BYWEEKNO=1',
    dtstart: '2016-01-01T09:00:00',
    tzid: null,
    count: 8,
  },
  {
    id: 'd',
    label: 'BYWEEKNO=53 @2015-01-01 (Thu, 53-week year)',
    rrule: 'FREQ=YEARLY;BYWEEKNO=53',
    dtstart: '2015-01-01T09:00:00',
    tzid: null,
    count: 8,
  },
]

function rruleTs(c: C): string[] {
  const dtstartBasic = c.dtstart.replace(/[-:]/g, '')
  const dtLine = c.tzid ? `DTSTART;TZID=${c.tzid}:${dtstartBasic}` : `DTSTART:${dtstartBasic}`
  const parsed = parse(`${dtLine}\nRRULE:${c.rrule}`)
  if (!parsed.ok) return ['parse error: ' + String(parsed.error)]
  return expand(parsed.value, c.count).map((o) =>
    String((o as { toString(): string }).toString()).replace(/\[.*\]$/, '')
  )
}

const py = JSON.parse(
  execFileSync('python3', ['oracle/dateutil_oracle.py'], {
    input: JSON.stringify(
      cases.map((c) => ({
        id: c.id,
        rrule: c.rrule,
        dtstart: c.dtstart,
        tzid: c.tzid,
        count: c.count,
      }))
    ),
    encoding: 'utf8',
  })
) as { id: string; occurrences: string[]; error: string | null }[]
const pyById = new Map(py.map((r) => [r.id, r]))

for (const c of cases) {
  console.log('\n### ' + c.label + '   (' + c.rrule + ', count=' + c.count + ')')
  const ts = rruleTs(c).map((s) => s.slice(0, 10))
  const js = runRRuleJs(c)
  const p = pyById.get(c.id)
  const jsOut = js.unsupported
    ? '(unsupported)'
    : js.error
      ? 'ERR ' + js.error
      : js.occurrences.map((s: string) => s.slice(0, 10)).join(' ')
  const pOut = p?.error
    ? 'ERR ' + p.error
    : (p?.occurrences ?? []).map((s) => s.slice(0, 10)).join(' ')
  console.log('  rrule-ts :', ts.join(' '))
  console.log('  rrule.js :', jsOut)
  console.log('  dateutil :', pOut)
}
