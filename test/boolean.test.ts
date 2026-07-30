import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { adversary } from '../src/index.js'

const forField = (schema: Parameters<typeof adversary>[0], field: string) =>
  adversary(schema).filter((f) => f.field === field)

describe('boolean fixtures (coercion traps)', () => {
  const fx = forField(z.object({ active: z.boolean() }), 'active')
  const fam = (name: string) => fx.find((f) => f.family === name)!

  it('every coercion trap is invalid against a strict boolean', () => {
    for (const name of ['string-false', 'string-true', 'string-zero', 'numeric-truthy', 'numeric-falsy', 'empty-string', 'checkbox-on']) {
      expect(fam(name).valid, name).toBe('invalid')
    }
  })

  it('claims are true: "false" is truthy while the number 0 is falsy', () => {
    expect(Boolean(fam('string-false').value as string)).toBe(true)
    expect(Boolean(fam('numeric-falsy').value as number)).toBe(false)
    // eslint-disable-next-line eqeqeq
    expect((fam('string-false').value as unknown) == false).toBe(false)
  })

  it('claims are true: 1 loosely equals true but is not strictly true', () => {
    const one = fam('numeric-truthy').value
    // eslint-disable-next-line eqeqeq
    expect(one == true).toBe(true)
    expect(one === true).toBe(false)
  })

  it('a checked checkbox posts the string "on"', () => {
    expect(fam('checkbox-on').value).toBe('on')
  })

  it('supplies false as the valid, easily-dropped control', () => {
    const f = fam('valid-false')
    expect(f.value).toBe(false)
    expect(f.valid).toBe('valid')
    // The exact trap the hypothesis names: a || fallback swallows a real false.
    expect((f.value as boolean) || 'default').toBe('default')
  })
})

describe('presence probes track nullable and required, not the type', () => {
  const nul = (fx: ReturnType<typeof adversary>) => fx.find((f) => f.family === 'null')!
  const absent = (fx: ReturnType<typeof adversary>) => fx.find((f) => f.family === 'absent')!

  it('a required, non-nullable field rejects both null and absence', () => {
    const fx = forField(z.object({ active: z.boolean() }), 'active')
    expect(nul(fx).value).toBe(null)
    expect(nul(fx).valid).toBe('invalid')
    expect(absent(fx).value).toBe(undefined)
    expect(absent(fx).valid).toBe('invalid')
  })

  it('a nullable field accepts null but still rejects absence', () => {
    const fx = forField(z.object({ active: z.boolean().nullable() }), 'active')
    expect(nul(fx).valid).toBe('valid')
    expect(absent(fx).valid).toBe('invalid')
  })

  it('an optional field accepts absence but still rejects null', () => {
    const fx = forField(z.object({ active: z.boolean().optional() }), 'active')
    expect(nul(fx).valid).toBe('invalid')
    expect(absent(fx).valid).toBe('valid')
  })

  it('applies to every field type, not just booleans', () => {
    const fx = forField(z.object({ name: z.string().min(2) }), 'name')
    expect(nul(fx)).toBeDefined()
    expect(absent(fx)).toBeDefined()
    expect(nul(fx).valid).toBe('invalid') // required, non-nullable string
  })
})
