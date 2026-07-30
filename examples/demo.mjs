// Run with: node examples/demo.mjs
// Exercises the built package end-to-end against a schema that touches every
// supported type, so the output doubles as a tour of what adversary generates.
import { z } from 'zod'
import { adversary, toMarkdown } from '../dist/index.js'

const Account = z.object({
  username: z.string().min(3).max(20), // string: length + hostile catalog
  age: z.number().int().min(18).max(120), // integer: boundaries + numeric traps
  role: z.enum(['admin', 'member', 'guest']), // enum: out-of-set, case, homoglyph, ...
  tags: z.array(z.string()).max(5), // array: length + per-element hazards
  active: z.boolean(), // boolean: coercion traps
  createdAt: z.iso.datetime(), // date-time: calendar and clock hazards
  contact: z.union([z.string().min(3), z.number().int()]), // union: branch seams
})

const fixtures = adversary(Account)
console.log(`Generated ${fixtures.length} fixtures across ${new Set(fixtures.map((f) => f.field)).size} fields.\n`)

// One example fixture per field, to show the shape of the labels.
const perField = new Map()
for (const f of fixtures) if (!perField.has(f.field)) perField.set(f.field, f)
for (const [field, f] of perField) {
  const value = JSON.stringify(f.value)?.slice(0, 34) ?? String(f.value)
  console.log(`${field.padEnd(10)} [${f.technique}] ${f.family.padEnd(26)} ${value}`)
}

// A field per new type, with the failure hypothesis that makes each explainable.
console.log('\n--- why each value might break (one per type) ---\n')
const highlight = [
  ['role', 'homoglyph-member'],
  ['tags', 'element-sql-injection'],
  ['active', 'checkbox-on'],
  ['createdAt', 'hour-24'],
  ['contact', 'numeric-string-confusion'],
]
for (const [field, family] of highlight) {
  const f = fixtures.find((x) => x.field === field && x.family === family)
  if (f) console.log(`[${field} / ${family}] ${JSON.stringify(f.value)}\n  ${f.failureHypothesis}\n`)
}

console.log('--- markdown report (role field, first 800 chars) ---\n')
console.log(toMarkdown(adversary(Account, { fields: ['role'] })).slice(0, 800))
