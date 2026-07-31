import type { FieldSpec } from '../schema-spec.js'
import type { Fixture } from '../types.js'

/**
 * Presence probes that apply to every field regardless of type: an explicit
 * `null` and an omitted field (`undefined`). Their validity is not a type
 * question but a schema one, so it is read from the field's own flags -
 * `nullable` decides whether null is allowed, `required` whether absence is -
 * which is exactly the distinction a hardcoded per-type null fixture gets wrong.
 */
export function presenceFixtures(field: FieldSpec): Fixture[] {
  return [
    {
      field: field.name,
      value: null,
      technique: 'EP',
      family: 'null',
      failureHypothesis: field.nullable
        ? 'Null, which this field permits. A valid value, but a falsy and untyped one: an if (value) gate, a value ?? default fallback, or a typeof check can mishandle a legitimately null field, and in SQL NULL is a tri-state that compares equal to nothing, not even itself.'
        : 'Null where a typed value is expected. Boolean(null) is false so it slips past a truthy guard, null == undefined is true so a == null nullish check treats it as absent, and if a nullable column or a JSON null reaches typed logic it reads as false or empty in JS yet as tri-state UNKNOWN in the database.',
      validity: field.nullable ? 'valid' : 'invalid',
    },
    {
      field: field.name,
      value: undefined,
      technique: 'EP',
      family: 'absent',
      failureHypothesis: field.required
        ? 'The field omitted entirely (undefined). Probes required-field enforcement: Boolean(undefined) is false and undefined == null is true, so an if (!value) guard or a == null check cannot tell a deliberately-omitted field from a supplied false or empty value, and required-versus-optional handling can collapse into one branch.'
        : 'The field omitted (undefined), which this optional field permits. A valid state, but one an over-strict presence check (a bare property assertion, a required-key guard) can still reject.',
      validity: field.required ? 'invalid' : 'valid',
    },
  ]
}
