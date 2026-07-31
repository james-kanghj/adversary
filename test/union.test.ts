import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { adversary } from '../src/index.js'

const scalar = z.union([z.string().min(3), z.number().int().min(0)])
const discriminated = z.discriminatedUnion('type', [
  z.object({ type: z.literal('a'), a: z.string() }),
  z.object({ type: z.literal('b'), value: z.number() }),
])

const forField = (schema: Parameters<typeof adversary>[0]) => adversary(schema).filter((f) => f.field === 'u')

describe('union fixtures (scalar branches)', () => {
  const fx = forField(z.object({ u: scalar }))
  const fam = (name: string) => fx.find((f) => f.family === name)!

  it('emits the seam families for a string | number union', () => {
    for (const name of ['no-branch-match', 'numeric-string-confusion', 'branch-boundary-gap', 'nan-serialization-branch-shift', 'branch-string-i18n']) {
      expect(fam(name), name).toBeDefined()
    }
  })

  it('no-branch-match uses a type absent from every branch', () => {
    expect(fam('no-branch-match').value).toBe(true) // boolean, in neither string nor number
    expect(fam('no-branch-match').validity).toBe('invalid')
  })

  it('claims are true: the confusion value validates as a string yet reads as a number', () => {
    const s = fam('numeric-string-confusion').value as string
    expect(typeof s).toBe('string')
    expect(s + 1).toBe(s + '1') // string concatenation, not addition
    expect((s as unknown) === Number(s)).toBe(false)
    expect(fam('numeric-string-confusion').validity).toBe('valid')
  })

  it('claims are true: the i18n branch value reads as a number but Number() is NaN', () => {
    expect(Number.isNaN(Number(fam('branch-string-i18n').value as string))).toBe(true)
  })

  it('claims are true: the NaN branch-shift value is a number whose JSON form is null', () => {
    expect(Number.isNaN(fam('nan-serialization-branch-shift').value as number)).toBe(true)
    expect(JSON.stringify(fam('nan-serialization-branch-shift').value)).toBe('null')
    expect(fam('nan-serialization-branch-shift').validity).toBe('unknown')
  })
})

describe('union fixtures (discriminated / oneOf)', () => {
  const fx = forField(z.object({ u: discriminated }))
  const fam = (name: string) => fx.find((f) => f.family === name)!

  it('detects the discriminant and probes the unknown and absent tag', () => {
    expect(fam('unknown-discriminant')).toBeDefined()
    expect(fam('missing-discriminant')).toBeDefined()
  })

  it('the unknown discriminant differs from a real tag only by case', () => {
    const v = fam('unknown-discriminant').value as { type: string }
    expect(v.type).toBe('A') // 'a' upper-cased; a case-folding router would wrongly accept
    expect(discriminated.safeParse({ type: 'a', a: 'x' }).success).toBe(true)
    expect(discriminated.safeParse(v).success).toBe(false)
  })

  it('the missing-discriminant object has no tag key', () => {
    const v = fam('missing-discriminant').value as Record<string, unknown>
    expect('type' in v).toBe(false)
    expect(fam('missing-discriminant').validity).toBe('invalid')
  })
})

// The strongest guarantee: every definite validity claim agrees with the union's
// own parser (unknown is skipped - it names branch-resolution ambiguity).
describe('union validity claims agree with Zod', () => {
  for (const [label, schema] of [
    ['scalar', scalar],
    ['discriminated', discriminated],
  ] as const) {
    it(`${label}: valid/invalid claims match safeParse`, () => {
      for (const f of forField(z.object({ u: schema }))) {
        if (f.validity === 'unknown' || f.family === 'null' || f.family === 'absent') continue
        expect(schema.safeParse(f.value).success, `${f.family} ${JSON.stringify(f.value)}`).toBe(f.validity === 'valid')
      }
    })
  }
})
