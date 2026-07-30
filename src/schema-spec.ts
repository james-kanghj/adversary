/**
 * The neutral, internal representation adversary generates from.
 *
 * We deliberately reduce every input schema (Zod today, others later) to plain
 * JSON-Schema-shaped constraints. That keeps the generators decoupled from any
 * one schema library's internals and makes the tool trivially extensible.
 */

export type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'unknown'

export interface FieldSpec {
  /** Property name. Empty string for a scalar root schema. */
  name: string
  type: FieldType
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  /** JSON Schema `format` hint, e.g. `"email"`, `"uuid"`. */
  format?: string
  required: boolean
}

export interface SchemaSpec {
  fields: FieldSpec[]
}

type JsonSchema = {
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  required?: string[]
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  format?: string
  [key: string]: unknown
}

function pickType(raw: JsonSchema): FieldType {
  const t = Array.isArray(raw.type) ? raw.type.find((x) => x !== 'null') : raw.type
  switch (t) {
    case 'string':
      return 'string'
    case 'integer':
      return 'integer'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    default:
      return 'unknown'
  }
}

function toFieldSpec(name: string, raw: JsonSchema, required: boolean): FieldSpec {
  const spec: FieldSpec = { name, type: pickType(raw), required }

  if (typeof raw.minLength === 'number') spec.minLength = raw.minLength
  if (typeof raw.maxLength === 'number') spec.maxLength = raw.maxLength

  // Prefer inclusive bounds; fold JSON Schema draft-7 exclusive bounds into inclusive
  // integer-adjacent values so BVA has a concrete number to sit on.
  if (typeof raw.minimum === 'number') spec.minimum = raw.minimum
  else if (typeof raw.exclusiveMinimum === 'number') {
    spec.minimum = spec.type === 'integer' ? raw.exclusiveMinimum + 1 : raw.exclusiveMinimum
  }
  if (typeof raw.maximum === 'number') spec.maximum = raw.maximum
  else if (typeof raw.exclusiveMaximum === 'number') {
    spec.maximum = spec.type === 'integer' ? raw.exclusiveMaximum - 1 : raw.exclusiveMaximum
  }

  if (typeof raw.format === 'string') spec.format = raw.format

  return spec
}

/** Reduce a JSON Schema object to a flat list of field specs (top level only for v1). */
export function jsonSchemaToSpec(json: unknown): SchemaSpec {
  const schema = (json ?? {}) as JsonSchema
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type

  if (type === 'object' && schema.properties) {
    const required = new Set(schema.required ?? [])
    const fields = Object.entries(schema.properties).map(([name, raw]) =>
      toFieldSpec(name, raw, required.has(name)),
    )
    return { fields }
  }

  // Scalar root schema: a single unnamed field.
  return { fields: [toFieldSpec('', schema, true)] }
}
