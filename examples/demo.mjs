// Run with: node examples/demo.mjs
// Exercises the built package end-to-end against a realistic schema.
import { z } from 'zod'
import { adversary, toMarkdown } from '../dist/index.js'

const Signup = z.object({
  username: z.string().min(3).max(20),
  age: z.number().int().min(18).max(120),
  email: z.email(),
})

const fixtures = adversary(Signup)
console.log(`Generated ${fixtures.length} fixtures.\n`)

// Show one fixture per family for the username field.
const seen = new Set()
for (const f of fixtures) {
  if (f.field !== 'username' || seen.has(f.family)) continue
  seen.add(f.family)
  const shown = JSON.stringify(f.value).slice(0, 32)
  console.log(`[${f.technique}] ${f.family.padEnd(22)} ${shown}`)
}

console.log('\n--- markdown report (first 900 chars) ---\n')
console.log(toMarkdown(adversary(Signup, { fields: ['username'] })).slice(0, 900))
