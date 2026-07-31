import type { FieldSpec } from '../schema-spec.js'
import type { Fixture, Technique, Validity } from '../types.js'

/** Boundary values plus the classic numeric traps, for one number/integer field. */
export function numberFixtures(field: FieldSpec): Fixture[] {
  const out: Fixture[] = []
  const seen = new Set<string>()
  const isInt = field.type === 'integer'
  const { minimum, maximum } = field

  const rangeValidity = (n: number): Validity => {
    if (Number.isNaN(n) || !Number.isFinite(n)) return 'unknown'
    if (isInt && !Number.isInteger(n)) return 'invalid'
    if (minimum !== undefined && (field.exclusiveMinimum ? n <= minimum : n < minimum)) return 'invalid'
    if (maximum !== undefined && (field.exclusiveMaximum ? n >= maximum : n > maximum)) return 'invalid'
    return 'valid'
  }

  const push = (
    value: number,
    technique: Technique,
    family: string,
    note: string,
    valid?: Validity,
  ): void => {
    const key = `${family}:${Object.is(value, -0) ? '-0' : String(value)}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({
      field: field.name,
      value,
      technique,
      family,
      failureHypothesis: note,
      validity: valid ?? rangeValidity(value),
    })
  }

  if (minimum !== undefined) {
    push(minimum - 1, 'BVA', 'below-min', `Just below minimum (${minimum}). Should be rejected.`)
    push(
      minimum,
      'BVA',
      'at-min',
      field.exclusiveMinimum
        ? `Exactly the exclusive minimum (${minimum}); the boundary is excluded, so this should be rejected.`
        : `Exactly minimum (${minimum}). The lower boundary; should be accepted.`,
    )
    // Skip the just-inside probe when the range is too narrow for it to actually be inside.
    if (maximum === undefined || minimum + 1 <= maximum) {
      push(minimum + 1, 'BVA', 'above-min', `Just inside minimum (${minimum}). Should be accepted.`)
    }
  }

  if (maximum !== undefined) {
    if (minimum === undefined || maximum - 1 >= minimum) {
      push(maximum - 1, 'BVA', 'below-max', `Just inside maximum (${maximum}). Should be accepted.`)
    }
    push(
      maximum,
      'BVA',
      'at-max',
      field.exclusiveMaximum
        ? `Exactly the exclusive maximum (${maximum}); the boundary is excluded, so this should be rejected.`
        : `Exactly maximum (${maximum}). The upper boundary; should be accepted.`,
    )
    push(maximum + 1, 'BVA', 'above-max', `Just above maximum (${maximum}). Should be rejected.`)
  }

  // Classic numeric traps (equivalence-class representatives), independent of range.
  push(0, 'EP', 'zero', 'Zero. The boundary between positive and negative, and a common divide-by and falsy trap.')
  push(
    -0,
    'EP',
    'negative-zero',
    'Negative zero. -0 === 0 is true, but Object.is(-0, 0) is false and 1 / -0 is -Infinity, so sign-sensitive logic can diverge.',
  )
  push(-1, 'EP', 'negative', 'A negative value. Probes fields that implicitly assume a non-negative quantity (counts, prices, ages).')
  push(
    Number.NaN,
    'EP',
    'nan',
    'NaN. Fails every comparison (NaN < min and NaN > max are both false), so a naive range guard lets it through.',
    'unknown',
  )
  push(
    Number.POSITIVE_INFINITY,
    'EP',
    'positive-infinity',
    'Positive infinity. Survives numeric type checks in some layers, breaks arithmetic and formatting, and JSON.stringify turns it into null.',
    'unknown',
  )
  push(
    Number.NEGATIVE_INFINITY,
    'EP',
    'negative-infinity',
    'Negative infinity. The same hazards as positive infinity, on the low side.',
    'unknown',
  )
  push(
    Number.MAX_SAFE_INTEGER + 1,
    'EP',
    'unsafe-integer',
    'Beyond Number.MAX_SAFE_INTEGER. Integer precision is lost, so equality, increments, and generated IDs silently collide.',
  )

  if (isInt) {
    const base = minimum !== undefined && Number.isFinite(minimum) ? minimum : 0
    push(
      base + 0.5,
      'EP',
      'non-integer',
      'A fractional value where an integer is required. Probes whether integer validation is actually enforced or the field is only typed as a number.',
      'invalid',
    )
  }

  return out
}
