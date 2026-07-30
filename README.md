# adversary

Generate **explained** adversarial test inputs from a schema. Point it at a Zod schema and get back the values most likely to break your code - boundary values, i18n/Unicode edge cases, and injection strings - each labelled with the technique that produced it and a plain-language reason it might fail.

```ts
import { z } from 'zod'
import { adversary } from 'adversary'

const Signup = z.object({
  username: z.string().min(3).max(20),
  age: z.number().int().min(18).max(120),
})

adversary(Signup)
// [
//   { field: 'username', value: 'aa', technique: 'BVA', family: 'below-min-length',
//     failureHypothesis: 'One character short of minLength (3). Should be rejected.', valid: 'invalid' },
//   { field: 'username', value: '👨‍👩‍👧‍👦', technique: 'i18n', family: 'grapheme-vs-codeunit',
//     failureHypothesis: 'A single family emoji ... String length is 11 UTF-16 code units ...', valid: 'unknown' },
//   { field: 'age', value: 17, technique: 'BVA', family: 'below-min', ... },
//   ...
// ]
```

## Why

Testing input handling means throwing hostile values at it. Today you either:

- **hand-write them** - tedious, and you do not know the obscure i18n cases;
- **use a property-based fuzzer** (fast-check) - powerful, but random and opaque: no explanation, no i18n depth, you write the generators yourself;
- **paste a list of naughty strings** - just strings, not tied to your schema and with no boundary values.

`adversary` sits in the gap. Every value it produces is **explainable** - a human can read the `failureHypothesis` and decide whether the case is worth keeping - and the Unicode catalog encodes localization-QA knowledge a generic generator does not ship. It does not compete with fast-check; it complements it.

## Install

```sh
npm i -D adversary
```

Zod is an optional peer dependency. `adversary()` accepts any schema that exposes a `toJSONSchema()` method (Zod v4 does). For a plain JSON Schema object, use `fromJsonSchema()` and skip Zod entirely.

## Use it in tests (shift-left)

The natural home for the fixtures is a `test.each` table, so the hostile inputs run in CI on every change:

```ts
import { describe, it, expect } from 'vitest'
import { adversary } from 'adversary'
import { Signup } from '../src/schema'

describe.each(adversary(Signup))('$field / $family', ({ field, value }) => {
  it('is handled, not crashed', () => {
    const result = Signup.safeParse({ ...validBase, [field]: value })
    // assert your own expectation: accepted-and-normalized, or rejected-cleanly.
    expect(result).toBeDefined()
  })
})
```

Runnable versions live in [`examples/`](examples/) and run as part of this repo's own test suite: [`shift-left.test.ts`](examples/shift-left.test.ts) asserts your schema agrees with each value's `valid` label (so a too-loose or too-strict schema fails CI), and [`harden-a-function.test.ts`](examples/harden-a-function.test.ts) drives an HTML escaper with the injection catalog via the `techniques` filter.

## Use it as a report (for a QA charter or a PR)

```ts
import { adversary, toMarkdown } from 'adversary'

console.log(toMarkdown(adversary(Signup)))
```

produces a risk-ranked Markdown report (injection first, boundary/equivalence last) with every value and its failure hypothesis. Non-ASCII is escaped to `\uXXXX` so invisible and bidi characters never corrupt the output.

## What you get

Each fixture is:

```ts
interface Fixture {
  field: string            // "username", or "" for a scalar schema
  value: unknown           // the adversarial value
  technique: 'BVA' | 'EP' | 'i18n' | 'injection'
  family: string           // e.g. "grapheme-vs-codeunit", "sql-injection"
  failureHypothesis: string // why this value might break the code
  valid: 'valid' | 'invalid' | 'unknown' // does it satisfy the field's own constraints?
}
```

`valid` is deliberately `'unknown'` for the i18n/injection catalog: whether those values are accepted is exactly the behaviour under test, so the tool does not pretend to know.

### Techniques

- **BVA** - boundary value analysis on `min`/`max` and length, plus the empty string and an unbounded-length probe.
- **EP** - equivalence-class representatives and classic numeric traps: `0`, `-0`, `NaN`, `Infinity`, past `MAX_SAFE_INTEGER`, non-integers where an integer is required.
- **i18n** - Unicode normalization (NFC vs NFD and NFKC compatibility folding), grapheme-vs-code-unit length, combining marks, locale-dependent and length-changing case mapping (the Turkish dotted I, the German eszett), bidi overrides, homoglyphs, fullwidth forms, invisible whitespace, soft hyphen, byte order mark, line separator, non-breaking space, astral-plane characters, lone surrogates, RTL text.
- **injection** - SQL, XSS (element and attribute), template/SSTI, spreadsheet formula (CSV), OS command, LDAP, XXE, JNDI (Log4Shell), path traversal, CRLF, NUL byte, format string.

### Type coverage

`adversary` reads these from the schema and generates fixtures for each:

- **string** - length boundaries (empty, min/max, an unbounded-length probe) plus the hostile i18n/injection catalog.
- **number / integer** - min/max boundaries and the classic numeric traps (`0`, `-0`, `NaN`, `Infinity`, past `MAX_SAFE_INTEGER`, non-integers).
- **boolean** - coercion traps (`"false"`, `"true"`, `"0"`, `1`/`0`, `""`, the `"on"` a checkbox posts) plus `false` as the valid value most often silently dropped.
- **enum / literal** - a valid-member control and the near-misses: out-of-set, a case variant, a whitespace-padded member, a member-superstring, a homoglyph, empty, and for numeric enums a stringified member and an in-range non-member.
- **array** - length boundaries, plus each element-type adversarial value carried into one slot of an otherwise legal array (an array of strings gets the catalog per element; an array of enums gets out-of-set), plus uniqueness, sparse-hole, and array-like duck-typing probes.
- **date / date-time** (`z.iso.date()` / `z.iso.datetime()`) - Feb 29 of a non-leap year, out-of-range components, year 0000 and 9999, a DST spring-forward gap, a leap second, the Y2038 overflow, a numeric timezone offset, and a SQL space-separated timestamp.
- **union** - scalar seams (a value matching no branch, a numeric string caught between a string and a number branch, a NaN branch-shift) and, for a discriminated union, an unknown or absent discriminant.

Every field also gets `null` and `absent` (undefined) probes whose validity tracks the field's `nullable` and `required` flags. Nested objects are read at the top level only for now; deeper nesting is on the roadmap.

## Options

```ts
adversary(schema, { techniques: ['injection'] }) // only injection cases
adversary(schema, { fields: ['username'] })       // only this field
```

## Status

Early (`0.1`), moving fast. Type coverage spans string, number/integer, boolean, enum/literal, array, date/date-time, and union today (see [Type coverage](#type-coverage)). The direction: a growing community-curated Unicode catalog, deeper object nesting, and framework-specific fixture emitters. The Unicode catalog is designed to accumulate - when you find a hostile input that breaks something real, it belongs here.

It can only **name the failure class to watch for**; it never guarantees a bug exists. Treat each case as a hypothesis to check, not a verdict.

## Contributing

The catalog is meant to accumulate. If a hostile value bit you in production, add it (with the reason it breaks) and open a PR - see [CONTRIBUTING.md](CONTRIBUTING.md). Every entry must carry a true, checkable failure hypothesis and a test that asserts the fact it rests on.

## License

MIT
