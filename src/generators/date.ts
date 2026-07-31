import type { FieldSpec } from '../schema-spec.js'
import type { Fixture, Technique, Validity } from '../types.js'

type When = 'date' | 'datetime' | 'both'

interface DateCase {
  value: string
  family: string
  technique: Technique
  validity: Validity
  when: When
  note: string
}

/**
 * Adversarial date and date-time strings. Validity is stated against the field's
 * own declared format (RFC 3339 as Zod's z.iso.date()/datetime() implement it):
 * component-out-of-range and wrong-shape values are `invalid`; real dates that
 * merely stress downstream layers are `valid`; and the two option-dependent
 * cases (an offset-less local time, a numeric offset) are `unknown`, because a
 * documented Zod option flips their acceptance. A leap second is `invalid`, not
 * ambiguous: RFC 3339 permits it, but the field's own validator rejects it.
 */
const CASES: readonly DateCase[] = [
  // -- date -----------------------------------------------------------------
  {
    value: '2023-02-29',
    family: 'feb29-non-leap-year',
    technique: 'BVA',
    validity: 'invalid',
    when: 'date',
    note: 'February 29 in 2023, which is not a leap year, so this calendar date does not exist. If a lenient parser rolls it forward instead of rejecting it, new Date("2023-02-29") becomes 2023-03-01, so a store-then-read round trip can silently change the recorded day.',
  },
  {
    value: '2024-13-01',
    family: 'month-out-of-range',
    technique: 'BVA',
    validity: 'invalid',
    when: 'date',
    note: 'Month 13 is one past the 1-12 range. Probes whether component ranges are validated or treated as modular arithmetic: strict parsers reject it, but libraries that do month math can wrap it into January of the next year, drifting the stored date by a year.',
  },
  {
    value: '2024-04-32',
    family: 'day-out-of-range',
    technique: 'BVA',
    validity: 'invalid',
    when: 'date',
    note: 'Day 32 exceeds the length of every month (April has 30 days). Probes day-rollover handling: strict parsers reject it while lenient date math can carry it into the following month, so range filters and same-day comparisons can drift.',
  },
  {
    value: '0000-01-01',
    family: 'year-zero',
    technique: 'BVA',
    validity: 'valid',
    when: 'date',
    note: 'Year 0000 satisfies the 4-digit year pattern but has no plain counterpart downstream: PostgreSQL DATE has no year 0, and ISO 8601 maps 0000 to 1 BCE. If accepted at the input layer but rejected at the database, the value passes validation yet fails on write.',
  },
  {
    value: '9999-12-31',
    family: 'far-future-year',
    technique: 'BVA',
    validity: 'valid',
    when: 'date',
    note: '9999-12-31 is the largest date a 4-digit year can express. Probes fixed-width year assumptions: the next representable day would need year 10000 (a fifth digit RFC 3339 cannot hold), and some 32-bit or strftime-based layers assume years fit a narrower range.',
  },
  {
    value: '01/02/2024',
    family: 'ambiguous-locale-format',
    technique: 'i18n',
    validity: 'invalid',
    when: 'date',
    note: '"01/02/2024" reads as January 2 under US MM/DD/YYYY but February 1 under the DD/MM/YYYY used across most of the world. It is not RFC 3339, so a strict parser rejects it while a locale-sensitive parser silently picks a month, producing different dates for different users.',
  },

  // -- date-time ------------------------------------------------------------
  {
    value: '2024-01-01T24:00:00Z',
    family: 'hour-24',
    technique: 'BVA',
    validity: 'invalid',
    when: 'datetime',
    note: 'Hour 24 sits outside the RFC 3339 00-23 range but is ISO 8601 end-of-day midnight. Parsers disagree: V8 accepts it and rolls to the next day 00:00, so new Date("2024-01-01T24:00:00Z") becomes 2024-01-02, while a strict validator rejects the same string - the two layers store different days.',
  },
  {
    value: '2024-03-10T02:30:00',
    family: 'dst-spring-forward-gap',
    technique: 'EP',
    validity: 'unknown',
    when: 'datetime',
    note: 'A local wall-clock time with no offset that never occurs in America/New_York, because spring-forward skips 02:00-03:00 on 2024-03-10. If interpreted in that zone the instant is undefined, so libraries variously shift it forward an hour or throw, and the same time can differ by an hour across systems. RFC 3339 requires an offset, so acceptance depends on whether a local-time option is in force.',
  },
  {
    value: '2016-12-31T23:59:60Z',
    family: 'leap-second',
    technique: 'BVA',
    validity: 'invalid',
    when: 'datetime',
    note: 'Second 60 is a genuine leap second inserted at 2016-12-31T23:59:60 UTC. RFC 3339 explicitly permits :60, but most parsers cap seconds at 59: new Date("2016-12-31T23:59:60Z") returns Invalid Date and z.iso.datetime() likewise rejects it, so timestamps captured during a leap second can be dropped by code that assumes the spec is fully implemented.',
  },
  {
    value: '2038-01-19T03:14:08Z',
    family: 'y2038-epoch-overflow',
    technique: 'BVA',
    validity: 'valid',
    when: 'datetime',
    note: 'One second past 2^31-1 epoch seconds, the signed 32-bit time_t maximum (2038-01-19T03:14:07Z). If any layer stores the instant in a 32-bit signed integer it overflows and wraps to a negative time near 1901, so timestamps after this point can sort or display as being in the distant past.',
  },
  {
    value: '2024-01-01T00:00:00+09:00',
    family: 'numeric-timezone-offset',
    technique: 'BVA',
    validity: 'unknown',
    when: 'datetime',
    note: 'A valid RFC 3339 timestamp with a +09:00 offset. Zod\'s default z.iso.datetime() accepts only a trailing Z and rejects any numeric offset, while V8 and most databases accept it and normalize to UTC (here the previous calendar day). If one layer rejects the offset form the other emits, or a layer strips the offset instead of converting it, the stored instant can shift by the offset and even change the recorded day.',
  },
  {
    value: '2024-01-01 00:00:00',
    family: 'space-separated-datetime',
    technique: 'EP',
    validity: 'invalid',
    when: 'datetime',
    note: 'A space-separated timestamp, the shape PostgreSQL and SQLite print. RFC 3339 requires the literal T separator, so z.iso.datetime() rejects it, yet new Date("2024-01-01 00:00:00") parses it fine as local time. A value read straight back out of the database can therefore fail the application\'s own date-time validator on a store-then-read round trip.',
  },

  // -- both -----------------------------------------------------------------
  {
    value: '',
    family: 'empty',
    technique: 'BVA',
    validity: 'invalid',
    when: 'both',
    note: 'Empty string, the most-forgotten input for a date field. Date.parse("") is NaN and new Date("") is Invalid Date, yet some ORMs and coercion layers turn "" into NULL or the Unix epoch (1970-01-01) rather than rejecting it, so a blank can be stored as a real-looking date.',
  },
  {
    value: 'not-a-date',
    family: 'non-date-string',
    technique: 'EP',
    validity: 'invalid',
    when: 'both',
    note: 'A clearly non-date string. new Date("not-a-date").getTime() is NaN, and NaN propagates silently: every comparison against it is false and arithmetic yields NaN, so a range guard like (d >= start && d <= end) can pass it through or drop it without an explicit error.',
  },
]

/** True for a string field whose declared format is a calendar date or timestamp. */
export function isDateFormat(field: FieldSpec): boolean {
  return field.type === 'string' && (field.format === 'date' || field.format === 'date-time')
}

/**
 * Date/date-time fixtures for a format-constrained string field. This supersedes
 * the plain string generator for such fields: length boundaries and the hostile
 * catalog are mostly out-of-format noise for a strict date, so a date field gets
 * date-shaped adversarial values instead.
 */
export function dateFixtures(field: FieldSpec): Fixture[] {
  const isDateTime = field.format === 'date-time'
  const wants = (w: When): boolean => w === 'both' || (isDateTime ? w === 'datetime' : w === 'date')
  return CASES.filter((c) => wants(c.when)).map((c) => ({
    field: field.name,
    value: c.value,
    technique: c.technique,
    family: c.family,
    failureHypothesis: c.note,
    validity: c.validity,
  }))
}
