import type { FieldSpec } from '../schema-spec.js'
import type { Fixture } from '../types.js'

/**
 * The boolean domain is exactly {true, false}, so the adversarial surface is
 * not the value set but coercion: non-boolean inputs that loose validation lets
 * through, flipping the meaning. Each value here is invalid against a strict
 * `type: 'boolean'` schema; the interest is what a coercing layer does with it.
 * (null and an omitted field are handled generically by presenceFixtures, since
 * their validity depends on the field's nullable/required flags.)
 */
const COERCION_TRAPS: ReadonlyArray<{ value: unknown; family: string; note: string }> = [
  {
    value: 'false',
    family: 'string-false',
    note: 'A non-empty string is truthy, so Boolean("false") is true: if loose validation coerces this query-string or env-var value with Boolean() or a bare if-check, a value that reads as false to a human flips to true. It also loosely equals neither true nor false, so a == comparison quietly misses it.',
  },
  {
    value: 'true',
    family: 'string-true',
    note: 'Boolean("true") is true, so loose coercion happens to give the right answer and the bug stays hidden - but the value is a string, so a later strict value === true is false and JSON.parse keeps it the string "true", letting an equality-based branch diverge from the coercing path.',
  },
  {
    value: '0',
    family: 'string-zero',
    note: 'Boolean("0") is true because every non-empty string is truthy, yet "0" == false is also true, and PHP and Perl treat "0" as falsy: the same value reads as true under a JS if-check but false across a loose == gate or a non-JS layer. It pairs with the number 0, which coerces to the opposite boolean.',
  },
  {
    value: 1,
    family: 'numeric-truthy',
    note: '1 == true is true but 1 === true is false: a value that came back from a DB round-trip as a number (SQLite has no boolean type; MySQL BOOLEAN is an alias for tinyint(1)) can pass a loose == gate yet fail a strict === true, so the persistence and application layers disagree about the same row.',
  },
  {
    value: 0,
    family: 'numeric-falsy',
    note: '0 is falsy and 0 == false, so a numeric false from a database or JSON body reads correctly under an if-check, but 0 === false is false, and an if(!value) guard cannot tell this supplied false from a missing field, so absent-versus-false can collapse into one branch.',
  },
  {
    value: '',
    family: 'empty-string',
    note: 'Boolean("") is false and "" == false, so an empty form field coerces to false and silently succeeds, masking that no boolean was ever chosen; downstream a deliberately-blank field and an explicit false become the same thing.',
  },
  {
    value: 'on',
    family: 'checkbox-on',
    note: 'A checked HTML checkbox posts "on" while an unchecked one sends nothing, so a boolean field can arrive as the truthy string "on" or as undefined but never as literal true or false. "on" == true is also false, so a loose == check does not rescue it.',
  },
]

/** Coercion traps for a boolean field, plus the easily-dropped valid value false. */
export function booleanFixtures(field: FieldSpec): Fixture[] {
  const out: Fixture[] = COERCION_TRAPS.map((c) => ({
    field: field.name,
    value: c.value,
    technique: 'EP' as const,
    family: c.family,
    failureHypothesis: c.note,
    valid: 'invalid' as const,
  }))

  out.push({
    field: field.name,
    value: false,
    technique: 'EP',
    family: 'valid-false',
    failureHypothesis:
      'false is a fully valid value, yet it is falsy: an if(value) gate, a value || defaultTrue fallback, or an if(!body.flag) required check treats a deliberately-supplied false exactly like missing or unset. This is the one valid value most likely to be silently dropped.',
    valid: 'valid',
  })

  return out
}
