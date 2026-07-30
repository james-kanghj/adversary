# Contributing to adversary

The most valuable contribution is a new **catalog entry**: a hostile input that
broke something real, written down with the reason it breaks. That curated,
explained catalog is what a generic fuzzer or a random string list does not
ship, so growing it is the point of the project.

You do not need to touch the generators to help. If you have a value that bit
you in production, add it to the catalog with its story and open a PR.

## Setup

```sh
git clone https://github.com/james-kanghj/adversary
cd adversary
npm install
npm test          # vitest
npm run typecheck # tsc --noEmit
npm run build     # tsup + dts
```

`node examples/demo.mjs` runs the built package end to end.

## Adding a catalog entry

Entries live in [`src/catalog.ts`](src/catalog.ts). Each is a `CatalogEntry`:

```ts
{
  value: 'straße',                 // the hostile input
  technique: 'i18n',               // 'i18n' | 'injection'
  family: 'case-mapping-expansion',// short kebab-case slug naming the failure class
  failureHypothesis:
    'The German eszett. "ß".toUpperCase() is "SS", so uppercasing lengthens the string ...',
}
```

Five rules, in priority order:

1. **It must be true.** The `failureHypothesis` has to state a concrete,
   checkable fact - a JS-semantics fact, or a cross-layer one (a database, another
   language, an HTTP or serialization boundary). If you cannot name a specific
   reason, the entry does not belong here.
2. **Honest tone.** An entry only *names a failure class to watch for*. Phrase it
   as "if ... then ...", "probes ...", "can ..." - never "this detects" or "this
   guarantees a bug". No em dashes; use plain hyphens.
3. **Unique value, kebab-case family.** No two entries share a `value`, and
   `family` matches `^[a-z0-9]+(-[a-z0-9]+)*$`.
4. **Keep invisible or ambiguous code points as `\u` escapes.** A soft hyphen,
   a BOM, or a U+2028 line separator written literally is invisible in review and
   can be normalized by an editor or break a bundler. Write `'ad­min'`, not a
   raw soft hyphen, and note the code point in a trailing comment.
5. **Prove the claim in a test.** Add an assertion to
   [`test/catalog.test.ts`](test/catalog.test.ts) under "expanded catalog claims
   are true" that checks the exact fact your hypothesis rests on. This is what
   keeps the catalog honest: a false or mistyped entry fails CI.

### Worked example

The entry above ships with this test, which asserts the one fact the hypothesis
depends on:

```ts
it('the eszett uppercases to two characters, changing length', () => {
  const v = byFamily('case-mapping-expansion').value
  expect(v.includes(cp(0x00df))).toBe(true) // contains U+00DF eszett
  expect(cp(0x00df).toUpperCase()).toBe('SS')
  expect(v.toUpperCase().length).toBeGreaterThan(v.length)
})
```

## Adding type coverage or a generator

Generators live in `src/generators/` and are wired through the `fieldFixtures`
dispatch in `src/index.ts`. The same discipline applies: every fixture carries a
non-empty `failureHypothesis`, and `valid` reports honestly whether the value
satisfies the field's own declared constraints (use `'unknown'` when acceptance
is exactly the behaviour under test). Where a schema library can decide validity,
assert your `valid` values against its parser in a test, as the date and union
suites do.

## Pull requests

- Keep commits small and focused.
- `npm test`, `npm run typecheck`, and `npm run build` all pass.
- Describe what broke and why the entry or change earns its place.

By contributing you agree that your work is licensed under the project's MIT
license.
