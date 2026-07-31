import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { adversary } from '../src/index.js'

const forField = (schema: Parameters<typeof adversary>[0]) =>
  adversary(schema).filter((f) => f.field === 'd')

describe('date fixtures supersede the string generator', () => {
  const fx = forField(z.object({ d: z.iso.date() }))

  it('emits date families, not string length or catalog noise', () => {
    expect(fx.some((f) => f.family === 'feb29-non-leap-year')).toBe(true)
    // A strict date should not carry length boundaries or the hostile catalog.
    for (const noise of ['at-max-length', 'below-min-length', 'sql-injection', 'grapheme-vs-codeunit']) {
      expect(fx.some((f) => f.family === noise), noise).toBe(false)
    }
  })
})

describe('date format gating', () => {
  const dateFx = forField(z.object({ d: z.iso.date() }))
  const dtFx = forField(z.object({ d: z.iso.datetime() }))

  it('date-only families appear for z.iso.date() but not the time-component ones', () => {
    expect(dateFx.some((f) => f.family === 'year-zero')).toBe(true)
    expect(dateFx.some((f) => f.family === 'hour-24')).toBe(false)
    expect(dateFx.some((f) => f.family === 'leap-second')).toBe(false)
  })

  it('time-component families appear for z.iso.datetime() but not the date-only ones', () => {
    expect(dtFx.some((f) => f.family === 'hour-24')).toBe(true)
    expect(dtFx.some((f) => f.family === 'leap-second')).toBe(true)
    expect(dtFx.some((f) => f.family === 'feb29-non-leap-year')).toBe(false)
  })

  it('empty and non-date-string apply to both', () => {
    for (const fx of [dateFx, dtFx]) {
      expect(fx.some((f) => f.family === 'empty')).toBe(true)
      expect(fx.some((f) => f.family === 'non-date-string')).toBe(true)
    }
  })
})

// The strongest guarantee: every definite validity claim must agree with the
// schema's own parser. 'unknown' is skipped (it names option-dependent cases).
describe('date validity claims agree with Zod', () => {
  for (const [label, schema] of [
    ['z.iso.date()', z.iso.date()],
    ['z.iso.datetime()', z.iso.datetime()],
  ] as const) {
    it(`${label}: valid/invalid claims match safeParse`, () => {
      for (const f of forField(z.object({ d: schema }))) {
        if (f.validity === 'unknown' || f.family === 'null' || f.family === 'absent') continue
        const accepted = schema.safeParse(f.value).success
        expect(accepted, `${f.family} ${JSON.stringify(f.value)}`).toBe(f.validity === 'valid')
      }
    })
  }
})

describe('date claims are true (cross-layer divergence)', () => {
  const dtFx = forField(z.object({ d: z.iso.datetime() }))
  const dateFx = forField(z.object({ d: z.iso.date() }))
  const val = (fx: typeof dtFx, name: string) => fx.find((f) => f.family === name)!.value as string

  it('Feb 29 of a non-leap year rolls forward to March in V8', () => {
    expect(new Date(val(dateFx, 'feb29-non-leap-year')).getUTCMonth()).toBe(2)
  })

  it('hour 24 rolls to the next day in V8 while a strict validator rejects it', () => {
    expect(new Date(val(dtFx, 'hour-24')).toISOString()).toBe('2024-01-02T00:00:00.000Z')
  })

  it('the leap second is Invalid Date in V8', () => {
    expect(Number.isNaN(new Date(val(dtFx, 'leap-second')).getTime())).toBe(true)
  })

  it('the Y2038 value is exactly one second past the signed 32-bit maximum', () => {
    expect(Math.floor(new Date(val(dtFx, 'y2038-epoch-overflow')).getTime() / 1000)).toBe(2 ** 31)
  })

  it('the +09:00 offset moves the UTC instant back to the previous day', () => {
    expect(new Date(val(dtFx, 'numeric-timezone-offset')).toISOString()).toBe('2023-12-31T15:00:00.000Z')
  })

  it('the space-separated timestamp parses in V8 though RFC 3339 needs a T', () => {
    expect(Number.isNaN(new Date(val(dtFx, 'space-separated-datetime')).getTime())).toBe(false)
  })
})
