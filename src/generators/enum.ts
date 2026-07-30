import type { FieldSpec } from '../schema-spec.js'
import type { Fixture, Technique } from '../types.js'

/**
 * Latin letters mapped to a visually confusable code point from another script.
 * Built at runtime from code points so this source stays ASCII while the exact
 * confusable is still exercised.
 */
const HOMOGLYPHS: Record<string, number> = {
  a: 0x0430, // Cyrillic a
  c: 0x0441, // Cyrillic c
  e: 0x0435, // Cyrillic e
  i: 0x0456, // Cyrillic i
  j: 0x0458, // Cyrillic j
  o: 0x043e, // Cyrillic o
  p: 0x0440, // Cyrillic p
  s: 0x0455, // Cyrillic s
  x: 0x0445, // Cyrillic x
  y: 0x0443, // Cyrillic y
}

/** Plausible values a caller might send that are almost never a declared member. */
const PLAUSIBLE_OUTSIDERS = ['none', 'other', 'all', 'default', 'unknown', 'test', 'null']

/** Swap the first mappable letter of `s` for a homoglyph; returns null if none maps. */
function homoglyphOf(s: string): string | null {
  for (let i = 0; i < s.length; i++) {
    const cp = HOMOGLYPHS[s[i] as string]
    if (cp !== undefined) return s.slice(0, i) + String.fromCodePoint(cp) + s.slice(i + 1)
  }
  return null
}

/**
 * Adversarial values for a field constrained to a fixed set (Zod enum, native
 * enum, or literal/const). Equivalence Partitioning: the sharpest inputs sit
 * just outside the valid class or look valid but are not. Validity is decided
 * by set membership - the field's own declared constraint - so every value here
 * reports honestly whether it is a member.
 */
export function enumFixtures(field: FieldSpec): Fixture[] {
  const members = field.enumValues ?? []
  if (members.length === 0) return []

  const out: Fixture[] = []
  const seen = new Set<string>()
  const isMember = (v: unknown): boolean => members.includes(v)

  const push = (value: unknown, technique: Technique, family: string, note: string): void => {
    const key = `${family}:${typeof value}:${String(value)}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({
      field: field.name,
      value,
      technique,
      family,
      failureHypothesis: note,
      valid: isMember(value) ? 'valid' : 'invalid',
    })
  }

  const isConst = members.length === 1
  const [stringMember] = members.filter((m): m is string => typeof m === 'string')
  const numberMembers = members.filter((m): m is number => typeof m === 'number')
  const [booleanMember] = members.filter((m): m is boolean => typeof m === 'boolean')

  // Valid control: confirm the accept path is actually reachable.
  const control = members[0]
  if (isConst) {
    push(
      control,
      'BVA',
      'exact-const',
      'The one value a literal accepts, supplied as a valid control. A suite built only of invalid inputs can miss code that rejects even the correct value - an over-strict guard, a coerced comparison, or a typo in the expected constant - so this confirms the accept path is reachable.',
    )
  } else {
    push(
      control,
      'EP',
      'valid-member',
      'A genuine enum member, supplied as a valid control. A suite made only of out-of-set and mutated values can miss code that wrongly rejects a legitimate member (a stale allow-list, or a normalization step applied before comparison), so this confirms the accept path is reachable.',
    )
  }

  // -- String-member mutations ---------------------------------------------
  if (stringMember !== undefined) {
    const cased = stringMember.toLowerCase() === stringMember ? stringMember.toUpperCase() : stringMember.toLowerCase()
    if (cased !== stringMember && !isMember(cased)) {
      push(
        cased,
        'i18n',
        'case-variant-member',
        'A member with its letter case flipped. Strict matching is case-sensitive so this is rejected, but a consumer comparing case-insensitively via toUpperCase/toLowerCase can accept it - and that fold is locale-dependent (Turkish dotted/dotless i is the classic divergence), so the same input can match in one deployment and not in another.',
      )
    }

    const padded = `${stringMember} `
    if (!isMember(padded)) {
      push(
        padded,
        'EP',
        'whitespace-padded-member',
        'A member wrapped in whitespace, as arrives from a late-trimmed form field, a CSV import, or ?x=admin%20. Strict matching treats it as a non-member, but layers disagree on trimming (JS trim(), Postgres btrim(), and Java String.trim() strip different sets), so it can be accepted at one boundary and rejected at another.',
      )
    }

    const superstring = `${stringMember}1`
    if (!isMember(superstring)) {
      push(
        superstring,
        'EP',
        'member-superstring',
        'A string that contains a member as a prefix but is not equal to it. Strict equality rejects it, but code matching with .includes(), .startsWith(), or an unanchored regex (/admin/ rather than /^admin$/) can accept a longer string as an authorized member.',
      )
    }

    const homoglyph = homoglyphOf(stringMember)
    if (homoglyph !== null && !isMember(homoglyph)) {
      push(
        homoglyph,
        'i18n',
        'homoglyph-member',
        'A member with one letter swapped for a visually identical code point from another script. It reads as a valid member to a human but is a distinct string, so strict validation rejects it; the risk is a layer that logs, displays, or denylists on the rendered text treating it as the real member.',
      )
    }

    if (!isMember('')) {
      push(
        '',
        'EP',
        'empty',
        "The empty string. HTML <select> defaults, empty query params, and cleared fields deliver '' rather than undefined. If code guards with if (value) (which is falsy for '') or treats '' as use-the-default instead of validating membership, a blank selection can bypass the check or silently pick a default.",
      )
    }

    const outsider = PLAUSIBLE_OUTSIDERS.find((v) => !isMember(v)) ?? `${stringMember}-x`
    push(
      outsider,
      'EP',
      'out-of-set',
      'A plausible value from the same domain as the members but not a declared one. If code routes on it with a switch default or a fallback branch instead of rejecting, an unrecognized value can slip into a default branch the caller did not intend rather than erroring.',
    )
  }

  // -- Numeric-member probes -----------------------------------------------
  if (numberMembers.length > 0) {
    const first = numberMembers[0] as number
    push(
      String(first),
      'EP',
      'stringified-member',
      "A member's correct text at the wrong primitive type (the string form of a numeric member), exactly as query params and form fields deliver. Type-sensitive checks (=== , JSON Schema enum) reject it, but a consumer using == or Number() coercion accepts it, so the outcome depends on which comparison the code uses.",
    )

    const lo = Math.min(...numberMembers)
    const hi = Math.max(...numberMembers)
    if (hi > lo) {
      let gap = lo + 0.5
      if (gap >= hi || isMember(gap)) {
        for (let n = Math.ceil(lo) + 1; n < hi; n++) {
          if (!isMember(n)) {
            gap = n
            break
          }
        }
      }
      if (gap > lo && gap < hi && !isMember(gap)) {
        push(
          gap,
          'EP',
          'in-range-non-member',
          'A number inside the members span but not itself a member. If a consumer validates with a range check (value >= min and value <= max) instead of set membership - a common shortcut - this in-range non-member slips through though it is not declared.',
        )
      }
    }

    const above = hi + 1
    if (!isMember(above)) {
      push(
        above,
        'EP',
        'out-of-range',
        'A number just past the largest declared member. The straightforward out-of-set case for a numeric enum; should be rejected.',
      )
    }
  }

  // -- Boolean-member probes -----------------------------------------------
  if (booleanMember !== undefined) {
    push(
      String(booleanMember),
      'EP',
      'stringified-member',
      "A boolean member as its string form ('true'/'false'), the shape query strings and form posts deliver. Type-sensitive checks reject it; a consumer coercing with Boolean() or comparing with == may accept it.",
    )
    if (isConst && !isMember(!booleanMember)) {
      push(
        !booleanMember,
        'EP',
        'out-of-set',
        'The other boolean, the only non-member value for a boolean literal. Should be rejected.',
      )
    }
  }

  return out
}
