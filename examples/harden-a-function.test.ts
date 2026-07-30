/**
 * Example: use adversary as a ready-made corpus to harden a function, not just a
 * schema. The `techniques` and `fields` options narrow the fixtures to the ones
 * that matter for the code under test.
 *
 * Here an HTML escaper is driven by the injection catalog: every payload that a
 * naive template would let through becomes a test case, each named by the family
 * it belongs to so a failure reads as "escapeHtml did not neutralize xss".
 */
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { adversary } from '../src/index.js'

// The function under test: escape user text before interpolating it into HTML.
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const Comment = z.object({ body: z.string().max(500) })
const injectionCorpus = adversary(Comment, { techniques: ['injection'], fields: ['body'] })

describe.each(injectionCorpus)('escapeHtml neutralizes $family', ({ value, failureHypothesis }) => {
  it('leaves no raw angle bracket or double quote to break out of the HTML context', () => {
    const escaped = escapeHtml(String(value))
    // No matter which payload, the escaped output cannot open a tag or an attribute.
    expect(escaped, failureHypothesis).not.toMatch(/[<>]/)
    expect(escaped).not.toContain('"')
  })
})
