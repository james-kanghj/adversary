import type { FieldSpec } from '../schema-spec.js'
import type { Fixture, Technique, Validity } from '../types.js'

/** ASCII decimal digits of the given length, e.g. 3 -> "123". */
const digits = (len: number): string => Array.from({ length: len }, (_, i) => String((i % 9) + 1)).join('')

/** Arabic-Indic decimal digits of the given length, e.g. 3 -> "١٢٣". */
const arabicDigits = (len: number): string =>
  Array.from({ length: len }, (_, i) => String.fromCodePoint(0x0661 + (i % 3))).join('')

/** Whether a string branch's acceptance of a plain digit string is fully determinable here. */
function stringBranchIsPlain(branch: FieldSpec): boolean {
  return branch.format === undefined && branch.pattern === undefined
}

/**
 * Adversarial values for a union field. Two families of hazard: the seams
 * between branches (a value matching no branch, a value matching the wrong one,
 * a numeric-looking string caught between a string and a number branch) and,
 * for a discriminated (oneOf) union, the tag dispatch itself (an unrecognized
 * or absent discriminant). Union acceptance is often the behaviour under test,
 * so several cases are deliberately `unknown`.
 */
export function unionFixtures(field: FieldSpec): Fixture[] {
  const out: Fixture[] = []
  const branches = field.anyOf ?? []
  if (branches.length === 0) return []

  const push = (value: unknown, technique: Technique, family: string, note: string, validity: Validity): void => {
    out.push({ field: field.name, value, technique, family, failureHypothesis: note, validity })
  }

  const normalizedTypes = new Set<string>(branches.map((b) => (b.type === 'integer' ? 'number' : b.type)))
  const stringBranch = branches.find((b) => b.type === 'string')
  const numberBranch = branches.find((b) => b.type === 'number' || b.type === 'integer')

  // -- A value whose runtime type appears in no branch ---------------------
  const outsiders: Array<[string, unknown]> = [
    ['boolean', true],
    ['string', 'unmatched-branch'],
    ['number', 987654],
  ]
  const outsider = outsiders.find(([t]) => !normalizedTypes.has(t))
  if (outsider) {
    push(
      outsider[1],
      'EP',
      'no-branch-match',
      'Matches none of the union branches, so it falls between the cracks and exercises the fallthrough path. If a consumer assumes a union value is always one of the known branches - an exhaustive switch with no default, or an unchecked cast after the last else-if - it can throw, return undefined, or silently drop the value.',
      'invalid',
    )
  }

  // -- String / number seam ------------------------------------------------
  if (stringBranch && numberBranch) {
    const min = Math.max(stringBranch.minLength ?? 1, 1)
    const confusion = digits(min)
    push(
      confusion,
      'EP',
      'numeric-string-confusion',
      'Validates as the string branch but reads, to a human and to loose code, as a number. If a consumer branches on typeof or does arithmetic or strict equality, the type it validated as and the type it is used as diverge: "123" + 1 is "1231" not 124, and "123" === 123 is false. Probes type confusion where two branches accept overlapping-looking data.',
      stringBranchIsPlain(stringBranch) ? 'valid' : 'unknown',
    )

    if (stringBranch.minLength !== undefined && stringBranch.minLength >= 2) {
      push(
        digits(stringBranch.minLength - 1),
        'BVA',
        'branch-boundary-gap',
        `A numeric-looking string one code unit below the string branch minLength (${stringBranch.minLength}), so the string branch rejects it for length; and the number branch does not coerce a string, so it rejects it too. It matches no branch even though a human reads it as a number. Probes the assumption that a numeric-looking value just under the string branch floor falls back to the number branch - it does not, and the gap between two adjacent branches goes uncovered.`,
        'invalid',
      )
    }
  }

  // -- Strongest per-branch value, tagged by branch ------------------------
  if (numberBranch) {
    push(
      Number.NaN,
      'EP',
      'nan-serialization-branch-shift',
      'typeof NaN is "number", so a typeof-based branch discriminator files NaN under the number branch; but JSON.stringify(NaN) is "null", so after a JSON round-trip the value becomes null and moves to a different branch, or to none. The branch a value lands in changes across the serialization boundary, on top of NaN escaping range guards since NaN < min and NaN > max are both false.',
      'unknown',
    )
  }

  if (stringBranch) {
    const len = Math.max(stringBranch.minLength ?? 1, 1)
    push(
      arabicDigits(len),
      'i18n',
      'branch-string-i18n',
      'Decimal digits in a non-ASCII script that a human reads as a number but Number() turns into NaN. A content-based router (if it parses as a number use the number branch, else the string branch) misroutes it to the string branch while a human-facing layer treats it as numeric. It also carries the string branch own i18n hazards (code-unit length, normalization) the union must not silently lose.',
      stringBranchIsPlain(stringBranch) ? 'valid' : 'unknown',
    )
  }

  // -- Discriminated (oneOf) tag dispatch ----------------------------------
  const discriminant = field.discriminant
  if (discriminant && discriminant.values.length > 0) {
    const { key, values } = discriminant
    const tag = values[0]
    let variant: unknown
    if (typeof tag === 'string') {
      const flipped = tag.toLowerCase() === tag ? tag.toUpperCase() : tag.toLowerCase()
      variant = flipped === tag ? `${tag}-x` : flipped
    } else {
      variant = `${String(tag)}-x`
    }
    push(
      { [key]: variant },
      'EP',
      'unknown-discriminant',
      `The discriminant "${key}" matches no branch tag because JSON Schema const and JS === are case-sensitive. It probes tag dispatch two ways at once: a switch with no default silently falls through, while a router that lower-cases or trims the tag before comparing would instead accept it and route to a real branch.`,
      'invalid',
    )

    push(
      {},
      'EP',
      'missing-discriminant',
      `The discriminant "${key}" is absent, so the tag reads as undefined rather than a wrong string. A different failure class from an unknown tag: a router that normalizes the tag before dispatch (${key}.toLowerCase(), ${key}.trim()) throws a TypeError on undefined instead of falling to a default arm, and switch(undefined) matches no case.`,
      'invalid',
    )
  }

  return out
}
