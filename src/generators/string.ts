import type { FieldSpec } from '../schema-spec.js'
import type { Fixture, Validity } from '../types.js'
import { catalog, packs } from '../catalog.js'

const UNBOUNDED_PROBE_LENGTH = 10_000

function lengthValidity(len: number, field: FieldSpec): Validity {
  if (field.minLength !== undefined && len < field.minLength) return 'invalid'
  if (field.maxLength !== undefined && len > field.maxLength) return 'invalid'
  return 'valid'
}

/** Boundary values on length + the hostile catalog, for one string field. */
export function stringFixtures(field: FieldSpec): Fixture[] {
  const out: Fixture[] = []
  const seen = new Set<string>()

  const pushLenBVA = (len: number, family: string, note: string): void => {
    if (len < 0) return
    const value = 'a'.repeat(len)
    if (seen.has(value)) return
    seen.add(value)
    out.push({
      field: field.name,
      value,
      technique: 'BVA',
      family,
      failureHypothesis: note,
      validity: lengthValidity(len, field),
    })
  }

  const { minLength, maxLength } = field

  // Empty is the most-forgotten input; always probe it.
  pushLenBVA(
    0,
    'empty',
    'Empty string. The most-forgotten input: probes required-vs-optional handling and any code that assumes a non-empty value.',
  )

  if (minLength !== undefined) {
    pushLenBVA(minLength - 1, 'below-min-length', `One character short of minLength (${minLength}). Should be rejected.`)
    pushLenBVA(minLength, 'at-min-length', `Exactly minLength (${minLength}). The lower boundary; should be accepted.`)
    // Skip the just-inside probe when the range is too narrow (e.g. a fixed length)
    // for minLength+1 to actually be within maxLength; that also frees the value so
    // the correct above-max-length fixture is not deduped away.
    if (maxLength === undefined || minLength + 1 <= maxLength) {
      pushLenBVA(minLength + 1, 'above-min-length', `Just inside minLength (${minLength}). Should be accepted.`)
    }
  }

  if (maxLength !== undefined) {
    if (maxLength - 1 >= (minLength ?? 0)) {
      pushLenBVA(maxLength - 1, 'below-max-length', `Just inside maxLength (${maxLength}). Should be accepted.`)
    }
    pushLenBVA(maxLength, 'at-max-length', `Exactly maxLength (${maxLength}). The upper boundary; should be accepted.`)
    pushLenBVA(maxLength + 1, 'above-max-length', `One character over maxLength (${maxLength}). Should be rejected.`)
  } else {
    const value = 'a'.repeat(UNBOUNDED_PROBE_LENGTH)
    if (!seen.has(value)) {
      seen.add(value)
      out.push({
        field: field.name,
        value,
        technique: 'BVA',
        family: 'unbounded-length',
        failureHypothesis: `No maxLength is declared. A ${UNBOUNDED_PROBE_LENGTH}-character value probes silent truncation at the storage layer (DB column width) and O(n^2) handling that turns into a denial of service.`,
        validity: 'unknown',
      })
    }
  }

  // The hostile catalog, plus a format-aware pack when the field declares a
  // matching `format` (e.g. email/uri/uuid). Whether each value is accepted is
  // exactly the behaviour under test, so validity is deliberately left 'unknown'.
  const pack = field.format ? packs[field.format] : undefined
  const entries = pack ? [...catalog, ...pack] : catalog
  for (const entry of entries) {
    out.push({
      field: field.name,
      value: entry.value,
      technique: entry.technique,
      family: entry.family,
      failureHypothesis: entry.failureHypothesis,
      validity: 'unknown',
    })
  }

  return out
}
