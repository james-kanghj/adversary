/**
 * Example: shift-left schema hardening.
 *
 * Drop every adversarial input adversary generates into your existing schema's
 * parser and run it in CI. Two things are checked for free:
 *   1. the validator never crashes - safeParse always returns a result;
 *   2. where adversary can determine a value's own validity, the schema agrees.
 *      A mismatch means the schema is too loose (accepts an out-of-range value)
 *      or too strict (rejects a boundary value it should allow).
 *
 * The i18n and injection catalog cases are labelled `valid: 'unknown'` on
 * purpose - whether your system should accept them is exactly the behaviour
 * under test, so this example leaves that assertion to you.
 *
 * In your project the import is `from 'adversary'`; here it points at the source.
 */
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { adversary } from '../src/index.js'

const Signup = z.object({
  username: z.string().min(3).max(20),
  age: z.number().int().min(18).max(120),
  role: z.enum(['admin', 'member', 'guest']),
})

const validBase: z.infer<typeof Signup> = { username: 'alice', age: 30, role: 'member' }

describe.each(adversary(Signup))('$field / $family ($technique)', ({ field, value, valid, failureHypothesis }) => {
  it('is handled without crashing, and the schema agrees where the disposition is known', () => {
    const result = Signup.safeParse({ ...validBase, [field]: value })

    // 1. adversary never makes your validator throw - safeParse always returns.
    expect(result).toBeDefined()

    // 2. assert the schema's disposition matches adversary's own-constraint verdict.
    if (valid === 'valid') expect(result.success, failureHypothesis).toBe(true)
    if (valid === 'invalid') expect(result.success, failureHypothesis).toBe(false)
  })
})
