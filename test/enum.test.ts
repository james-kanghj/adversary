import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { adversary, fromJsonSchema } from '../src/index.js'

const cp = (...points: number[]) => String.fromCodePoint(...points)

describe('enum fixtures (string enum)', () => {
  const Role = z.object({ role: z.enum(['admin', 'user', 'guest']) })
  const fx = adversary(Role).filter((f) => f.field === 'role')
  const fam = (name: string) => fx.find((f) => f.family === name)
  const members = ['admin', 'user', 'guest']

  it('routes an enum to the enum generator, not the string generator', () => {
    // length-boundary families belong to strings; an enum must never emit them.
    expect(fx.some((f) => f.family === 'below-min-length' || f.family === 'at-max-length')).toBe(false)
    expect(fx.length).toBeGreaterThan(0)
    expect(fx.every((f) => f.technique !== 'injection')).toBe(true)
  })

  it('emits the equivalence-class families', () => {
    for (const name of ['valid-member', 'out-of-set', 'case-variant-member', 'whitespace-padded-member', 'member-superstring', 'homoglyph-member', 'empty']) {
      expect(fam(name), name).toBeDefined()
    }
  })

  it('validity is exactly set membership (the field constraint)', () => {
    for (const f of fx) {
      expect(f.valid, `${f.family} ${String(f.value)}`).toBe(members.includes(f.value as string) ? 'valid' : 'invalid')
    }
  })

  it('the valid control is a real member; the mutations are not', () => {
    expect(members.includes(fam('valid-member')!.value as string)).toBe(true)
    expect(members.includes(fam('out-of-set')!.value as string)).toBe(false)
    expect(members.includes(fam('case-variant-member')!.value as string)).toBe(false)
  })

  it('claims are true: the padded member trims back to a member but is not one itself', () => {
    const padded = fam('whitespace-padded-member')!.value as string
    expect(padded.trim()).toBe('admin')
    expect(members.includes(padded)).toBe(false)
  })

  it('claims are true: the superstring contains a member as a prefix', () => {
    const s = fam('member-superstring')!.value as string
    expect(s.startsWith('admin')).toBe(true)
    expect(s).not.toBe('admin')
  })

  it('claims are true: the homoglyph reads like a member but uses a non-ascii code point', () => {
    const h = fam('homoglyph-member')!.value as string
    expect(h).not.toBe('admin')
    expect(h.length).toBe('admin'.length)
    // The first character is Cyrillic a (U+0430), not ASCII a (U+0061).
    expect(h.codePointAt(0)).toBe(0x0430)
    expect(h.codePointAt(0)).not.toBe(0x0061)
  })

  it('every family slug is kebab-case and every hypothesis is non-empty', () => {
    for (const f of fx) {
      expect(f.family).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(f.failureHypothesis.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('enum fixtures (string literal)', () => {
  const fx = adversary(z.object({ status: z.literal('PENDING') })).filter((f) => f.field === 'status')
  const fam = (name: string) => fx.find((f) => f.family === name)

  it('supplies the exact literal as a valid control', () => {
    const exact = fam('exact-const')!
    expect(exact.value).toBe('PENDING')
    expect(exact.valid).toBe('valid')
  })

  it('the case-variant near-miss is rejected', () => {
    const cased = fam('case-variant-member')!
    expect(cased.value).toBe('pending')
    expect(cased.valid).toBe('invalid')
  })
})

describe('enum fixtures (numeric enum)', () => {
  const fx = fromJsonSchema({ type: 'number', enum: [1, 2, 3] })
  const fam = (name: string) => fx.find((f) => f.family === name)

  it('the valid control is a member number', () => {
    expect(fam('valid-member')!.value).toBe(1)
    expect(fam('valid-member')!.valid).toBe('valid')
  })

  it('claims are true: the stringified member is loosely equal but not strictly equal', () => {
    const s = fam('stringified-member')!.value
    expect(s).toBe('1')
    // eslint-disable-next-line eqeqeq
    expect(s == 1).toBe(true)
    expect(s === 1).toBe(false)
    expect(fam('stringified-member')!.valid).toBe('invalid')
  })

  it('claims are true: the in-range non-member sits between members but is absent from the set', () => {
    const g = fam('in-range-non-member')!.value as number
    expect(g).toBeGreaterThan(1)
    expect(g).toBeLessThan(3)
    expect([1, 2, 3].includes(g)).toBe(false)
    expect(fam('in-range-non-member')!.valid).toBe('invalid')
  })

  it('emits an out-of-range value past the largest member', () => {
    expect(fam('out-of-range')!.value).toBe(4)
    expect(fam('out-of-range')!.valid).toBe('invalid')
  })
})

describe('enum fixtures (numeric literal)', () => {
  const fx = adversary(z.object({ answer: z.literal(42) })).filter((f) => f.field === 'answer')
  const fam = (name: string) => fx.find((f) => f.family === name)

  it('claims are true: the numeric literal only accepts the number, and == vs === diverge', () => {
    expect(fam('exact-const')!.value).toBe(42)
    expect(fam('exact-const')!.valid).toBe('valid')
    const s = fam('stringified-member')!.value
    expect(s).toBe('42')
    // eslint-disable-next-line eqeqeq
    expect(s == 42).toBe(true)
    expect(s === 42).toBe(false)
    expect(fam('stringified-member')!.valid).toBe('invalid')
  })
})
