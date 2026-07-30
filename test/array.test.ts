import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { adversary, fromJsonSchema } from '../src/index.js'

const famOf = (fx: ReturnType<typeof adversary>, name: string) => fx.find((f) => f.family === name)

describe('array fixtures (length boundaries)', () => {
  const fx = adversary(z.object({ tags: z.array(z.string()).min(1).max(3) })).filter((f) => f.field === 'tags')

  it('probes the empty array, marked invalid because minItems is 1', () => {
    const empty = famOf(fx, 'empty')!
    expect(Array.isArray(empty.value)).toBe(true)
    expect((empty.value as unknown[]).length).toBe(0)
    expect(empty.valid).toBe('invalid')
  })

  it('sits on both boundaries and one past the max', () => {
    expect((famOf(fx, 'at-min-items')!.value as unknown[]).length).toBe(1)
    expect(famOf(fx, 'at-min-items')!.valid).toBe('valid')
    expect((famOf(fx, 'at-max-items')!.value as unknown[]).length).toBe(3)
    expect(famOf(fx, 'at-max-items')!.valid).toBe('valid')
    expect((famOf(fx, 'above-max-items')!.value as unknown[]).length).toBe(4)
    expect(famOf(fx, 'above-max-items')!.valid).toBe('invalid')
  })

  it('emits below-min-items only when minItems-1 is above zero', () => {
    // minItems is 1, so minItems-1 === 0 is already covered by the empty family.
    expect(famOf(fx, 'below-min-items')).toBeUndefined()
    const fx2 = adversary(z.object({ t: z.array(z.string()).min(2) })).filter((f) => f.field === 't')
    expect((famOf(fx2, 'below-min-items')!.value as unknown[]).length).toBe(1)
    expect(famOf(fx2, 'below-min-items')!.valid).toBe('invalid')
  })

  it('probes an unbounded array only when no maxItems is declared', () => {
    expect(famOf(fx, 'unbounded-length')).toBeUndefined() // maxItems is 3
    const fx2 = adversary(z.object({ t: z.array(z.string()) })).filter((f) => f.field === 't')
    const unb = famOf(fx2, 'unbounded-length')!
    expect((unb.value as unknown[]).length).toBe(10_000)
    expect(unb.valid).toBe('unknown')
  })
})

describe('array fixtures (element hazard)', () => {
  const fx = adversary(z.object({ tags: z.array(z.string()).max(3) })).filter((f) => f.field === 'tags')
  const elements = fx.filter((f) => f.family.startsWith('element-'))

  it('carries each element-level adversarial value into one slot of a legal array', () => {
    expect(elements.length).toBeGreaterThan(0)
    for (const f of elements) {
      expect(Array.isArray(f.value)).toBe(true)
      const arr = f.value as unknown[]
      expect(arr.length).toBeGreaterThanOrEqual(1)
      expect(arr.length).toBeLessThanOrEqual(3) // stays within maxItems so the hazard is isolated to the element
    }
  })

  it('inherits the element technique - it never hardcodes injection', () => {
    const sql = elements.find((f) => f.family === 'element-sql-injection')!
    expect(sql.technique).toBe('injection')
    const homoglyph = elements.find((f) => f.family === 'element-homoglyph')!
    expect(homoglyph.technique).toBe('i18n')
    // The XSS payload actually reaches the element slot.
    expect((sql.value as unknown[]).some((v) => typeof v === 'string' && v.includes("OR '1'='1'"))).toBe(true)
  })

  it('array-of-enum recurses into the enum generator, not the string generator', () => {
    const roles = adversary(z.object({ roles: z.array(z.enum(['admin', 'user'])) })).filter((f) => f.field === 'roles')
    const outOfSet = roles.find((f) => f.family === 'element-out-of-set')!
    expect(outOfSet.value).toEqual(['none'])
    expect(outOfSet.valid).toBe('invalid')
    // string-only element families must not appear for an enum element.
    expect(roles.some((f) => f.family === 'element-sql-injection')).toBe(false)
  })

  it('suppresses element hazards when maxItems is 0 (no slot to place one)', () => {
    const fx0 = fromJsonSchema({ type: 'array', items: { type: 'string' }, maxItems: 0 })
    expect(fx0.some((f) => f.family.startsWith('element-'))).toBe(false)
    expect(famOf(fx0, 'empty')!.valid).toBe('valid') // length 0 satisfies maxItems 0
  })
})

describe('array fixtures (uniqueness, sparse, array-like)', () => {
  it('emits duplicate-items only when uniqueItems is declared', () => {
    const noUnique = adversary(z.object({ t: z.array(z.string()) })).filter((f) => f.field === 't')
    expect(noUnique.some((f) => f.family === 'duplicate-items')).toBe(false)

    const unique = fromJsonSchema({ type: 'array', items: { type: 'string' }, uniqueItems: true, minItems: 2 })
    const dup = famOf(unique, 'duplicate-items')!
    const arr = dup.value as unknown[]
    expect(new Set(arr).size).toBeLessThan(arr.length) // a genuine duplicate under SameValueZero
    expect(dup.valid).toBe('invalid')
  })

  it('claims are true: a sparse array has a hole that length still counts', () => {
    const fx = adversary(z.object({ t: z.array(z.string()).min(2) })).filter((f) => f.field === 't')
    const sparse = famOf(fx, 'sparse-array')!.value as unknown[]
    expect(sparse.length).toBeGreaterThanOrEqual(2)
    expect(1 in sparse).toBe(false) // the hole is genuinely absent
    expect(Object.keys(sparse).length).toBeLessThan(sparse.length)
    expect(JSON.stringify(sparse)).toContain('null') // a hole serializes as null
  })

  it('claims are true: the array-like value is not an array but duck-types as one', () => {
    const fx = adversary(z.object({ t: z.array(z.string()) })).filter((f) => f.field === 't')
    const al = famOf(fx, 'array-like-object')!.value as { length: number; map?: unknown }
    expect(Array.isArray(al)).toBe(false)
    expect(typeof al.length).toBe('number')
    expect(typeof al.map).not.toBe('function') // it lacks the array methods code will call
    expect(Array.from(al as ArrayLike<unknown>).length).toBe(al.length)
    expect(famOf(fx, 'array-like-object')!.valid).toBe('invalid')
  })
})
