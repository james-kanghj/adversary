# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow semantic versioning.

## [1.0.0] - 2026-07-31

First stable release. The public API - `adversary`, `fromJsonSchema`, `toMarkdown`, `catalog`,
`packs`, and the exported types - now follows semantic versioning: a breaking change requires a
major bump. Everything from 0.2.0 through 0.6.0 (full type coverage, presence probes, the CLI,
runnable examples, and the seven format-aware packs) ships as part of 1.0.

### Changed (breaking)

- `Fixture.valid` is renamed to `validity`, matching the exported `Validity` type. The CLI's JSON
  output key changes from `valid` to `validity` accordingly.
- The internal representation is no longer public: `jsonSchemaToSpec`, `FieldSpec`, `SchemaSpec`,
  and `FieldType` are no longer exported, so they stay free to change without a major bump.
- `fromJsonSchema` now throws a `TypeError` on a non-object argument instead of returning
  presence-only fixtures, matching `adversary()`.
- `catalog` and `packs` are exported as `readonly` types.

### Fixed

- Validity is no longer mislabeled for exclusive numeric bounds (`z.number().gt(0)` / `positive()`),
  fixed and narrow ranges (`z.string().length(3)`, `z.number().min(5).max(5)`), arrays whose
  elements carry a format the filler cannot satisfy (`z.array(z.email())`), and tuples
  (`prefixItems`, which also no longer trigger a spurious unbounded-length probe).

### Added

- `engines` declares Node `>=20`, and CJS type declarations (`dist/index.d.cts`) so `require()` /
  `nodenext` consumers resolve correct types instead of ESM-only ones.

## [0.6.0] - 2026-07-31

### Added

- Two more format-aware packs. `ipv6` (`z.ipv6()`): loopback, an IPv4-mapped address
  (`::ffff:127.0.0.1`) that maps to IPv4 loopback and bypasses `::1` / `127.0.0.1` string
  filters, unspecified (`::`), link-local, unique-local (private), and the uncompressed
  loopback form - all valid IPv6 that pass validation yet are SSRF or internal targets.
  `base64` (`z.base64()`): valid base64 that decodes to an XSS, SQL, or NUL-byte payload
  (encoding validation is not content validation), plus the URL-safe alphabet and a
  line-wrapped form that standard base64 rejects but base64url / MIME decoders accept.

### Changed

- The null-byte catalog entry is now written as a `\u0000` escape, so the catalog source
  carries no raw control characters.

## [0.5.0] - 2026-07-31

### Added

- Two more format-aware packs. `hostname` (`z.hostname()`): the loopback name, an
  all-numeric host that C resolvers read as an integer IP, the GCP metadata name, an
  IDN homograph host, and the trailing-dot and uppercase forms. `ipv4` (`z.ipv4()`):
  loopback, cloud-metadata, unspecified (`0.0.0.0`), private-range, and broadcast
  addresses (all valid IPv4 that pass validation yet are SSRF or internal targets),
  plus an octal-octet form (`0177.0.0.1`) that `z.ipv4()` rejects but inet_aton reads
  as `127.0.0.1`. Every hypothesis is checked against Zod's own validator.

## [0.4.0] - 2026-07-31

### Added

- Format-aware packs: when a string field declares a `format`, extra hostile inputs
  targeting that format's own parsers and consumers are injected on top of the general
  catalog. Packs ship for `email` (CRLF header injection, punycode homograph domain,
  oversized local part, plus-subaddressing, IP address literal, trailing-dot domain),
  `url` / `uri` (`javascript:` and `data:` XSS, `file://` read, cloud-metadata /
  localhost / IPv6-loopback SSRF, an integer-obfuscated host, an IDN homograph host,
  userinfo host confusion, a backslash-authority parser split), and `uuid` (nil,
  non-v4, uppercase, max, hyphenless,
  brace-wrapped). Many pass their format's own validator yet remain dangerous. Exposed
  via a new `packs` export.

## [0.3.0] - 2026-07-31

### Added

- A command-line interface: `adversary <schema-file> [options]`. It loads a Zod schema
  from a `.ts` / `.js` / `.mjs` / `.cjs` module (its default export, a sole schema-like
  export, or `--export <name>`) or a JSON Schema from a `.json` file, and prints fixtures
  as JSON or a Markdown report (`--report`), with `--technique` and `--field` filters.
  Loading a `.ts` file uses Node's built-in type stripping. In JSON output, values JSON
  cannot represent are encoded so nothing is silently lost: the `absent` probe becomes
  `null`, and `NaN` / `Infinity` / `-Infinity` / `-0` become those literal strings.
- Runnable example tests under `examples/` (a shift-left schema-hardening suite and an
  HTML-escaper hardened with the injection catalog) that run as part of the test suite.

### Fixed

- `fromJsonSchema` no longer throws `Cannot use 'in' operator` on a non-object JSON Schema
  (a bare scalar, array, or null); such a node now reduces to a field with no fixtures.

## [0.2.0] - 2026-07-31

### Added

- Type coverage for `boolean`, `enum`/`literal`, `array`, `date`/`date-time`, and
  `union` fields. Previously only `string` and `number`/`integer` produced fixtures.
  - **enum / literal**: a valid-member control and the near-misses (out-of-set, case
    variant, whitespace-padded member, member-superstring, homoglyph, empty, and for
    numeric enums a stringified member and an in-range non-member).
  - **array**: length boundaries, each element-type adversarial value carried into one
    slot of an otherwise legal array (an array of enums yields out-of-set, an array of
    strings yields the hostile catalog per element), plus uniqueness, sparse-hole, and
    array-like duck-typing probes.
  - **boolean**: coercion traps (`"false"`, `"true"`, `"0"`, `1`/`0`, `""`, checkbox
    `"on"`) plus `false` as the valid value most often silently dropped.
  - **date / date-time**: Feb 29 of a non-leap year, out-of-range components, year 0000
    and 9999, a DST spring-forward gap, a leap second, the Y2038 overflow, a numeric
    timezone offset, and a SQL space-separated timestamp.
  - **union**: scalar seams (no-branch-match, numeric-string confusion, a branch
    boundary gap, a NaN branch-shift) and, for a discriminated union, an unknown or
    absent discriminant.
- `null` and `absent` (undefined) presence probes on every field, with validity read
  from the field's `nullable` and `required` flags.
- 11 curated catalog entries: NFKC compatibility folding, length-changing case mapping
  (German eszett), soft hyphen, byte order mark, Unicode line separator, and a lone
  surrogate (i18n); spreadsheet formula (CSV/DDE), JNDI (Log4Shell), OS command
  substitution, LDAP filter escape, and XXE (injection).
- GitHub Actions CI across Node 20, 22, 24, and 26 (typecheck, test, build, and a
  built-artifact smoke test).
- `CONTRIBUTING.md` documenting the catalog entry contract.

### Changed

- `enum` fields now route to a dedicated enum generator instead of receiving string
  length-boundary and hostile-catalog fixtures, which were all merely out-of-set noise
  for a fixed value set.
- `date`/`date-time` string fields now produce date-shaped fixtures instead of generic
  string ones.
- The Markdown report renders arrays, objects, `null`, and `undefined` values (not just
  scalars), keeping any non-ASCII inside them escaped.

### Note

Because `enum` and `date` fields now generate different, more accurate fixtures, the
exact set of fixtures `adversary()` returns for a given schema has changed. The public
API and exported types are unchanged.

## [0.1.0]

### Added

- Initial release: explained adversarial inputs (Boundary Value Analysis, Equivalence
  Partitioning, i18n/Unicode, injection) for `string` and `number`/`integer` fields,
  from a Zod v4 schema (via `toJSONSchema()`) or a plain JSON Schema object.
- `toMarkdown()` risk-ranked report with non-ASCII escaping.
- A curated, explained catalog of hostile Unicode and injection strings.

[1.0.0]: https://github.com/james-kanghj/adversary/releases/tag/v1.0.0
[0.6.0]: https://github.com/james-kanghj/adversary/releases/tag/v0.6.0
[0.5.0]: https://github.com/james-kanghj/adversary/releases/tag/v0.5.0
[0.4.0]: https://github.com/james-kanghj/adversary/releases/tag/v0.4.0
[0.3.0]: https://github.com/james-kanghj/adversary/releases/tag/v0.3.0
[0.2.0]: https://github.com/james-kanghj/adversary/releases/tag/v0.2.0
[0.1.0]: https://github.com/james-kanghj/adversary/releases/tag/v0.1.0
