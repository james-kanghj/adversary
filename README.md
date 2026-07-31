<div align="center">

# Adversary

[![npm](https://img.shields.io/npm/v/adversary.svg)](https://www.npmjs.com/package/adversary) [![release](https://img.shields.io/github/v/release/james-kanghj/adversary.svg)](https://github.com/james-kanghj/adversary/releases/latest) [![downloads](https://img.shields.io/npm/dm/adversary.svg)](https://www.npmjs.com/package/adversary) [![CI](https://github.com/james-kanghj/adversary/actions/workflows/ci.yml/badge.svg)](https://github.com/james-kanghj/adversary/actions/workflows/ci.yml) [![types](https://img.shields.io/npm/types/adversary.svg)](https://www.npmjs.com/package/adversary)

[![minzipped size](https://img.shields.io/bundlephobia/minzip/adversary.svg)](https://bundlephobia.com/package/adversary) [![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://www.npmjs.com/package/adversary?activeTab=dependencies) [![license: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE) [![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md) [![last commit](https://img.shields.io/github/last-commit/james-kanghj/adversary.svg)](https://github.com/james-kanghj/adversary/commits/main) [![issues](https://img.shields.io/github/issues/james-kanghj/adversary.svg)](https://github.com/james-kanghj/adversary/issues)

Generate **explained** adversarial test inputs from a schema - boundary values, i18n/Unicode edge cases, and injection strings, each labelled with the technique that produced it and a plain-language reason it might fail.

<img src="https://raw.githubusercontent.com/james-kanghj/adversary/main/examples/demo.gif" alt="adversary CLI: a Zod schema turned into explained adversarial inputs" width="820">

</div>

**What it is:** a test-input generator. Hand it a Zod schema and it returns a list of the values most likely to break the code behind it, each labelled with the technique that produced it and a plain-language reason it might fail.

**What it is not:** a scanner or a linter. It does not run your code, find bugs, or warn you. It hands you the hostile inputs; you feed them into your own tests (where your assertions, or the schema's own `safeParse`, do the checking) or render them as a report. `adversary(schema)` returns plain data - an array you use:

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
//     failureHypothesis: 'One character short of minLength (3). Should be rejected.', validity: 'invalid' },
//   { field: 'username', value: '👨‍👩‍👧‍👦', technique: 'i18n', family: 'grapheme-vs-codeunit',
//     failureHypothesis: 'A single family emoji ... String length is 11 UTF-16 code units ...', validity: 'unknown' },
//   { field: 'age', value: 17, technique: 'BVA', family: 'below-min', ... },
//   ...
// ]
```

**No AI, no hallucination.** Every `failureHypothesis` is hand-curated, not generated at run time, and each is backed by a test that asserts the exact fact it rests on - `'ß'.toUpperCase()` is `'SS'`, `z.url()` really does accept `javascript:`, the family emoji is 11 UTF-16 code units. The explanations are deterministic and offline: no API key, no cost, and no made-up reasons. A wrong or overclaimed one fails CI.

## Who it is for

Anyone who validates untrusted input with **Zod** - a form body, an API request, a webhook, a config file - and wants that input handling tested against hostile values, without hand-writing every edge case or being an i18n/security expert. It packages QA craft (boundary-value analysis, equivalence partitioning, a curated Unicode and injection catalog) so you get it from a schema for free.

**QA engineers** who have no Zod schema can start from an **OpenAPI spec** instead - `npx adversary ./openapi.yaml --report` gives a per-endpoint, explained hostile-input list with no code to write. It automates what you would otherwise test by hand; the report also serves a security or PR review.

## When you would reach for it

- **You just wrote a Zod schema** for something that receives outside input and want hostile-input tests in CI - one `test.each(adversary(Schema))` line ([example](examples/shift-left.test.ts)).
- **You are hardening an endpoint** and want to see, concretely, which dangerous values your schema still lets through.
- **You are reviewing a PR** and want a risk-ranked, explained list of the inputs that field invites - `toMarkdown(...)` or `npx adversary schema.ts --report`.

The aha: `z.url()` looks like it keeps bad URLs out. It does not, and adversary shows you exactly which ones slip past validation, so you know the code behind the field is the real line of defense:

```ts
const Webhook = z.object({ callbackUrl: z.url() })

for (const f of adversary(Webhook, { techniques: ['injection'] })) {
  const passes = Webhook.safeParse({ callbackUrl: f.value }).success
  console.log(passes ? 'ACCEPTED' : 'rejected', f.family, JSON.stringify(f.value))
}
// ACCEPTED  javascript-scheme     "javascript:alert(document.domain)"   <- XSS if used as an href
// ACCEPTED  file-scheme           "file:///etc/passwd"                  <- local file read
// ACCEPTED  cloud-metadata-ssrf   "http://169.254.169.254/latest/..."   <- SSRF to instance credentials
// ...validation passed on all of them. That is the point: validation is not safety.
```

Compared with the alternatives: hand-writing misses the obscure cases; a property fuzzer (fast-check) is random and opaque and you write the generators; a naughty-strings list is just strings, not tied to your schema and with no boundary values or explanations. adversary is deterministic, schema-derived, and every value explains itself - it complements fast-check, it does not compete.

## Install

```sh
npm i -D adversary
```

Zod is an optional peer dependency. `adversary()` accepts any schema that exposes a `toJSONSchema()` method (Zod v4 does). For a plain JSON Schema object, use `fromJsonSchema()` and skip Zod entirely:

```ts
import { fromJsonSchema } from 'adversary'

const fixtures = fromJsonSchema({
  type: 'object',
  properties: { email: { type: 'string', format: 'email' } },
  required: ['email'],
})
```

## Use it in tests (shift-left)

The natural home for the fixtures is a `test.each` table, so the hostile inputs run in CI on every change:

```ts
import { describe, it, expect } from 'vitest'
import { adversary } from 'adversary'
import { Signup } from '../src/schema'

const validBase = { username: 'alice', age: 30 } // a value your schema accepts

describe.each(adversary(Signup))('$field / $family', ({ field, value }) => {
  it('is handled, not crashed', () => {
    const result = Signup.safeParse({ ...validBase, [field]: value })
    // assert your own expectation: accepted-and-normalized, or rejected-cleanly.
    expect(result).toBeDefined()
  })
})
```

Runnable versions live in [`examples/`](examples/) and run as part of this repo's own test suite: [`shift-left.test.ts`](examples/shift-left.test.ts) asserts your schema agrees with each value's `validity` label (so a too-loose or too-strict schema fails CI), and [`harden-a-function.test.ts`](examples/harden-a-function.test.ts) drives an HTML escaper with the injection catalog via the `techniques` filter.

## Use it as a report (for a QA charter or a PR)

```ts
import { adversary, toMarkdown } from 'adversary'

console.log(toMarkdown(adversary(Signup)))
```

produces a risk-ranked Markdown report (injection first, boundary/equivalence last) with every value and its failure hypothesis. Non-ASCII is escaped to `\uXXXX` so invisible and bidi characters never corrupt the output.

## CLI

Point the CLI at a schema file for fixtures as JSON, or a Markdown report:

```sh
npx adversary ./schema.ts                       # JSON fixtures on stdout
npx adversary ./schema.ts --report              # Markdown risk report
npx adversary ./schema.ts --technique injection,i18n
npx adversary ./api.schema.json --field email   # a JSON Schema file, one field
npx adversary ./openapi.yaml --report           # an OpenAPI spec, per operation
```

The file may be a `.ts` / `.js` / `.mjs` / `.cjs` module exporting a Zod schema (its default export, or `--export <name>`), a `.json` file containing a JSON Schema, or an **OpenAPI 3.x document** (`.json`, or `.yaml`/`.yml` with the optional `yaml` package). Loading a `.ts` file uses Node's built-in type stripping (Node 22.18+).

### From an OpenAPI spec (no Zod schema needed)

If you have an API spec but no Zod schema - the common case for QA - point the CLI straight at it. Each operation's JSON request body and its parameters are reduced to a schema and reported separately, so you get an explained, per-endpoint hostile-input list without writing any code:

```sh
npx adversary ./openapi.yaml --report                    # every operation
npx adversary ./openapi.yaml --technique injection       # JSON, injection only
```

<div align="center">
<img src="https://raw.githubusercontent.com/james-kanghj/adversary/main/examples/openapi-demo.gif" alt="adversary CLI: an OpenAPI spec turned into explained adversarial inputs per operation" width="820">
</div>

```
# POST /webhooks (body)
...
# GET /users/{id} (params)
...
```

JSON output is grouped `[{ method, path, source: 'body' | 'params', fixtures }]`. Internal `$ref`s are resolved and OpenAPI 3.0 `nullable: true` is honored. The same is available in code via `fromOpenApi(doc)`.

```
--report          Markdown report instead of JSON fixtures
--export <name>   which export to use (default: the default, else the first schema-like export)
--technique <t>   BVA, EP, i18n, injection (repeatable or comma-separated)
--field <name>    limit to these fields (repeatable or comma-separated)
--title <text>    title for the Markdown report
-h, --help    -v, --version
```

Exit codes: `0` success, `1` a runtime error (bad schema or file), `2` a usage error (bad arguments). In JSON output, values JSON cannot represent are encoded so nothing is silently lost: the `absent` probe becomes `null`, and `NaN` / `Infinity` / `-Infinity` / `-0` become those literal strings (revive them rather than testing `null`/`0`).

## On a real project (not just Zod)

Because it runs off any JSON Schema, you can point it at a real backend - not only a Zod schema. Here it is on [frameboard](https://github.com/james-kanghj/frameboard) (a FastAPI + Pydantic app): Pydantic emits the JSON Schema for its RICE-scoring request - bounds, enum, and `uuid` format and all - and adversary turns each field into explained boundary and equivalence-class probes. It reads `confidence`'s `0..1` range and generates the exact edge values (`-1`, `0`, `1`, `2`), and it knows `impact` is an enum, so it generates `0.75` - in range, but not a declared member (the case a `min <= x <= max` shortcut lets through).

<div align="center">
<img src="https://raw.githubusercontent.com/james-kanghj/adversary/main/examples/frameboard-demo.gif" alt="adversary CLI: a FastAPI/Pydantic model turned into explained boundary and enum probes" width="820">
</div>

Any schema source works the same way: `python -c "import json; from app.schemas import RICEScoreRequest; print(json.dumps(RICEScoreRequest.model_json_schema()))" > rice.json` then `npx adversary rice.json --report`.

## What you get

Each fixture is:

```ts
interface Fixture {
  field: string            // "username", or "" for a scalar schema
  value: unknown           // the adversarial value
  technique: 'BVA' | 'EP' | 'i18n' | 'injection'
  family: string           // e.g. "grapheme-vs-codeunit", "sql-injection"
  failureHypothesis: string // why this value might break the code
  validity: 'valid' | 'invalid' | 'unknown' // does it satisfy the field's own constraints?
}
```

`validity` is deliberately `'unknown'` for the i18n/injection catalog: whether those values are accepted is exactly the behaviour under test, so the tool does not pretend to know.

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

Every field also gets `null` and `absent` (undefined) probes whose validity tracks the field's `nullable` and `required` flags. Composite fields are read at the top level only for now - a nested object, a `z.record`, or a `z.intersection` reduces to the presence probes rather than being descended into; deeper nesting is on the roadmap.

### Format-aware packs

When a string field declares a `format` - `z.email()`, `z.url()`, `z.uuid()` - adversary injects extra hostile inputs aimed at that format's own parsers and consumers, on top of the general catalog:

- **email**: CRLF header injection, a punycode homograph domain, an oversized (RFC-over-limit) local part, plus-subaddressing, an IP address literal, and a DNS-rooted trailing-dot domain.
- **url** (`uri`): `javascript:` and `data:` scheme XSS, a `file://` read, cloud-metadata / localhost / IPv6-loopback SSRF, an integer-obfuscated host, an IDN homograph host, userinfo host confusion (`https://trusted@evil.test`), and a backslash-authority parser split.
- **uuid**: the nil UUID, a non-v4 (predictable) UUID, an uppercase UUID, the max UUID, and the hyphenless and brace-wrapped forms.
- **hostname**: the loopback name, an all-numeric host (resolves to an integer IP), the GCP metadata name, an IDN homograph host, and the trailing-dot and uppercase forms.
- **ipv4**: loopback, cloud-metadata, unspecified (`0.0.0.0`), private-range, and broadcast addresses, plus an octal-octet form (`0177.0.0.1`) that C resolvers read as `127.0.0.1`.
- **ipv6**: loopback, an IPv4-mapped address (`::ffff:127.0.0.1`) that bypasses `::1` / `127.0.0.1` string filters, unspecified (`::`), link-local, and unique-local addresses, plus the uncompressed loopback form.
- **base64**: valid base64 that decodes to an XSS, a SQL, or a NUL-byte payload (encoding is not content), plus the URL-safe alphabet and a line-wrapped form other decoders accept.

Several of these **pass their `z.*()` validator** yet remain dangerous, which is the point: validation alone does not make them safe. The packs live in `src/catalog.ts` and are designed to grow - a new format is a new key.

## Options

```ts
adversary(schema, { techniques: ['injection'] }) // only injection cases
adversary(schema, { fields: ['username'] })       // only this field
```

## API

The public surface (stable under semver from `1.0`):

- **`adversary(schema, options?)`** - fixtures from a Zod v4 schema (anything with `toJSONSchema()`). Throws a `TypeError` if the argument is not schema-like.
- **`fromJsonSchema(json, options?)`** - fixtures from a plain JSON Schema object. Throws a `TypeError` if the argument is not an object.
- **`fromOpenApi(doc, options?)`** - fixtures from an OpenAPI 3.x document, grouped per operation: `Array<{ method, path, source: 'body' | 'params', fixtures }>`. Resolves internal `$ref`s and honors OpenAPI 3.0 `nullable`. Throws a `TypeError` if the argument is not an OpenAPI document (`isOpenApiDocument(doc)` tests this).
- **`toMarkdown(fixtures, { title? })`** - a risk-ranked Markdown report (injection first), with non-ASCII escaped to `\uXXXX`.
- **`catalog`** - the general curated hostile-input catalog (`readonly CatalogEntry[]`), injected into every string field.
- **`packs`** - the format-aware packs, `Readonly<Record<format, readonly CatalogEntry[]>>` keyed by JSON Schema `format` (`email`, `uri`, `uuid`, `hostname`, `ipv4`, `ipv6`, `base64`).

`options` is `{ techniques?: Technique[]; fields?: string[] }`. Exported types: `Fixture`, `Technique`, `Validity`, `CatalogEntry`, `SchemaLike`, `AdversaryOptions`, `MarkdownOptions`, `OpenApiFixtures`. To list a schema's field names: `[...new Set(fixtures.map((f) => f.field))]`.

## Status

Stable and actively developed. Type coverage spans string, number/integer, boolean, enum/literal, array, date/date-time, and union (see [Type coverage](#type-coverage)), with format-aware packs for email, url, uuid, hostname, ipv4, ipv6, and base64, and entry points for Zod, plain JSON Schema, and OpenAPI 3.x. The public API - `adversary`, `fromJsonSchema`, `fromOpenApi`, `toMarkdown`, `catalog`, `packs`, and the `Fixture` type - is frozen under semver from `1.0`. Planned next: deeper object nesting, more format packs, and framework-specific fixture emitters. The curated catalog is designed to accumulate - when you find a hostile input that breaks something real, it belongs here.

It can only **name the failure class to watch for**; it never guarantees a bug exists. Treat each case as a hypothesis to check, not a verdict.

## Contributing

The catalog is meant to accumulate. If a hostile value bit you in production, add it (with the reason it breaks) and open a PR - see [CONTRIBUTING.md](CONTRIBUTING.md). Every entry must carry a true, checkable failure hypothesis and a test that asserts the fact it rests on.

## License

MIT
