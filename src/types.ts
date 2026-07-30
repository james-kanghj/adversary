/**
 * The test-design technique that produced a fixture.
 *
 * - `BVA`       Boundary Value Analysis - values sitting on and just past a limit.
 * - `EP`        Equivalence Partitioning - a representative of a class of inputs.
 * - `i18n`      Internationalization / Unicode edge cases (normalization, graphemes, bidi, ...).
 * - `injection` Hostile payloads (SQL, XSS, template, path traversal, ...).
 */
export type Technique = 'BVA' | 'EP' | 'i18n' | 'injection'

/**
 * Whether a value satisfies the field's own declared constraints.
 *
 * `unknown` is used on purpose for i18n/injection cases: whether they are accepted
 * is exactly the ambiguous behaviour under test, so adversary does not pretend to know.
 */
export type Validity = 'valid' | 'invalid' | 'unknown'

/** A single adversarial input, with the reasoning attached. */
export interface Fixture {
  /** The field this value targets. Empty string for a scalar (non-object) schema. */
  field: string
  /** The adversarial value to feed into the field. */
  value: unknown
  /** Which test-design technique produced this value. */
  technique: Technique
  /** A short kebab-case slug naming the failure class, e.g. `"grapheme-vs-codeunit"`. */
  family: string
  /** Plain-language reason this value might break the code. Never empty. */
  failureHypothesis: string
  /** Whether the value satisfies the field's own constraints, where determinable. */
  valid: Validity
}

/** A curated hostile input plus the reason it is dangerous. */
export interface CatalogEntry {
  value: string
  technique: Extract<Technique, 'i18n' | 'injection'>
  family: string
  failureHypothesis: string
}
