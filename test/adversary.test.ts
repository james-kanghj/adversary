import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { adversary, fromJsonSchema, toMarkdown } from '../src/index.js'

const Signup = z.object({
  username: z.string().min(3).max(20),
  age: z.number().int().min(18).max(120),
  email: z.email(),
})

describe('adversary(zodSchema)', () => {
  const fixtures = adversary(Signup)

  it('produces fixtures for every string and number field', () => {
    expect(fixtures.length).toBeGreaterThan(0)
    const fields = new Set(fixtures.map((f) => f.field))
    expect(fields.has('username')).toBe(true)
    expect(fields.has('age')).toBe(true)
    expect(fields.has('email')).toBe(true)
  })

  it('every fixture carries a non-empty failure hypothesis (the core promise)', () => {
    for (const f of fixtures) {
      expect(f.failureHypothesis.trim().length).toBeGreaterThan(0)
    }
  })

  it('every family slug is kebab-case', () => {
    for (const f of fixtures) {
      expect(f.family).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it('marks length boundary validity correctly', () => {
    const uname = fixtures.filter((f) => f.field === 'username')
    const atMin = uname.find((f) => f.family === 'at-min-length')!
    const belowMin = uname.find((f) => f.family === 'below-min-length')!
    const aboveMax = uname.find((f) => f.family === 'above-max-length')!
    expect((atMin.value as string).length).toBe(3)
    expect(atMin.valid).toBe('valid')
    expect((belowMin.value as string).length).toBe(2)
    expect(belowMin.valid).toBe('invalid')
    expect((aboveMax.value as string).length).toBe(21)
    expect(aboveMax.valid).toBe('invalid')
  })

  it('injects the hostile catalog into string fields', () => {
    const uname = fixtures.filter((f) => f.field === 'username')
    expect(uname.some((f) => f.family === 'grapheme-vs-codeunit')).toBe(true)
    expect(uname.some((f) => f.family === 'homoglyph')).toBe(true)
    expect(uname.some((f) => f.technique === 'injection')).toBe(true)
  })

  it('generates boundary + trap values for integer fields, including a non-integer', () => {
    const age = fixtures.filter((f) => f.field === 'age')
    const atMin = age.find((f) => f.family === 'at-min')!
    const belowMin = age.find((f) => f.family === 'below-min')!
    expect(atMin.value).toBe(18)
    expect(atMin.valid).toBe('valid')
    expect(belowMin.value).toBe(17)
    expect(belowMin.valid).toBe('invalid')

    const nonInt = age.find((f) => f.family === 'non-integer')!
    expect(Number.isInteger(nonInt.value as number)).toBe(false)
    expect(nonInt.valid).toBe('invalid')

    expect(age.some((f) => f.family === 'nan')).toBe(true)
    expect(age.some((f) => f.family === 'unsafe-integer')).toBe(true)
  })
})

describe('options', () => {
  it('filters by technique', () => {
    const only = adversary(Signup, { techniques: ['injection'] })
    expect(only.length).toBeGreaterThan(0)
    expect(only.every((f) => f.technique === 'injection')).toBe(true)
  })

  it('filters by field', () => {
    const only = adversary(Signup, { fields: ['username'] })
    expect(only.length).toBeGreaterThan(0)
    expect(only.every((f) => f.field === 'username')).toBe(true)
  })
})

describe('fromJsonSchema (no Zod required)', () => {
  it('works from a plain JSON Schema object', () => {
    const fx = fromJsonSchema({
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 5 } },
      required: ['name'],
    })
    expect(fx.some((f) => f.family === 'at-max-length' && (f.value as string).length === 5)).toBe(true)
  })

  it('handles a scalar root schema as a single unnamed field', () => {
    const fx = fromJsonSchema({ type: 'string', minLength: 2 })
    expect(fx.length).toBeGreaterThan(0)
    expect(fx.every((f) => f.field === '')).toBe(true)
  })
})

describe('adversary() input validation', () => {
  it('throws a helpful error when given a non-schema', () => {
    expect(() => adversary({} as unknown as Parameters<typeof adversary>[0])).toThrow(/toJSONSchema/)
  })
})

describe('toMarkdown', () => {
  const md = toMarkdown(adversary(Signup))

  it('names the fields and headings', () => {
    expect(md).toContain('# Adversarial report')
    expect(md).toContain('## Field: `username`')
  })

  it('escapes non-ascii so bidi and control characters never land raw in the report', () => {
    const rlo = String.fromCodePoint(0x202e)
    expect(md.includes(rlo)).toBe(false) // no raw right-to-left override
    expect(md).toContain('\\u202E') // the escaped form appears instead
  })
})

describe('toMarkdown renders non-scalar values', () => {
  it('shows arrays in JSON form and keeps non-ascii inside elements escaped', () => {
    const md = toMarkdown(adversary(z.object({ tags: z.array(z.string()) })))
    expect(md).toContain('["' + "' OR '1'='1' --" + '"]') // an array literal, not a comma-joined string
    expect(md.includes(String.fromCodePoint(0x202e))).toBe(false) // element bidi still escaped
    expect(md).toContain('\\u202E')
  })

  it('renders null and undefined presence probes readably', () => {
    const md = toMarkdown(adversary(z.object({ name: z.string() })))
    expect(md).toContain('**null** `null`')
    expect(md).toContain('**absent** `undefined`')
  })
})
