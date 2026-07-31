import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { adversary, fromJsonSchema } from '../src/index.js'

const forField = (schema: Parameters<typeof adversary>[0], field = 'x') => adversary(schema).filter((f) => f.field === field)

describe('exclusive numeric bounds', () => {
  it('marks the boundary invalid and never claims a Zod-rejected value is valid', () => {
    const schema = z.number().gt(0)
    const fx = forField(z.object({ x: schema }))
    const atMin = fx.find((f) => f.family === 'at-min')!
    expect(atMin.value).toBe(0)
    expect(atMin.validity).toBe('invalid')
    // the collateral EP zero fixtures are corrected too
    expect(fx.find((f) => f.family === 'zero')?.validity).toBe('invalid')
    // invariant: every fixture labelled valid actually passes the schema
    for (const f of fx) {
      if (f.validity === 'valid') expect(schema.safeParse(f.value).success, String(f.value)).toBe(true)
    }
  })

  it('folds exclusive integer bounds to the next integer (gt(10) -> min 11)', () => {
    const fx = forField(z.object({ x: z.number().int().gt(10) }))
    const atMin = fx.find((f) => f.family === 'at-min')!
    expect(atMin.value).toBe(11)
    expect(atMin.validity).toBe('valid')
  })
})

describe('narrow and fixed-length ranges', () => {
  it('a fixed-length string emits above-max-length and no contradictory above-min-length', () => {
    const schema = z.string().length(3)
    const fx = forField(z.object({ x: schema }), 'x')
    expect(fx.some((f) => f.family === 'above-max-length')).toBe(true)
    expect(fx.some((f) => f.family === 'above-min-length')).toBe(false)
    for (const f of fx) {
      if (f.validity === 'valid') expect(schema.safeParse(f.value).success, JSON.stringify(f.value)).toBe(true)
    }
  })

  it('a fixed-value numeric range does not emit a boundary fixture that contradicts its validity', () => {
    const schema = z.number().int().min(5).max(5)
    const fx = forField(z.object({ x: schema }))
    expect(fx.some((f) => f.family === 'above-min')).toBe(false)
    expect(fx.some((f) => f.family === 'below-max')).toBe(false)
    for (const f of fx) {
      if (f.validity === 'valid') expect(schema.safeParse(f.value).success, String(f.value)).toBe(true)
    }
  })
})

describe('array element validity', () => {
  it('length fixtures are unknown when the element has a format the filler cannot satisfy', () => {
    const emailArr = adversary(z.object({ a: z.array(z.email()).min(1) })).filter((f) => f.field === 'a')
    expect(emailArr.find((f) => f.family === 'at-min-items')?.validity).toBe('unknown')

    const plainArr = adversary(z.object({ a: z.array(z.string()).min(1) })).filter((f) => f.field === 'a')
    expect(plainArr.find((f) => f.family === 'at-min-items')?.validity).toBe('valid')
  })
})

describe('tuple (prefixItems)', () => {
  it('gets fixed-length bounds and no spurious unbounded-length probe', () => {
    const fx = fromJsonSchema({ type: 'array', prefixItems: [{ type: 'string' }, { type: 'number' }] })
    expect(fx.some((f) => f.family === 'unbounded-length')).toBe(false)
    expect(fx.find((f) => f.family === 'empty')?.validity).toBe('invalid') // an empty array is the wrong arity
    expect(fx.some((f) => f.family === 'at-max-items')).toBe(true)
    expect(fx.some((f) => f.family === 'above-max-items')).toBe(true)
  })
})
