/**
 * The neutral, internal representation adversary generates from.
 *
 * We deliberately reduce every input schema (Zod today, others later) to plain
 * JSON-Schema-shaped constraints. That keeps the generators decoupled from any
 * one schema library's internals and makes the tool trivially extensible.
 */

export type FieldType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'enum'
  | 'array'
  | 'union'
  | 'unknown'

export interface FieldSpec {
  /** Property name. Empty string for a scalar root schema. */
  name: string
  type: FieldType
  required: boolean
  /** The schema admitted a `null` branch (e.g. a nullable field). */
  nullable?: boolean

  // -- string --------------------------------------------------------------
  minLength?: number
  maxLength?: number
  /** JSON Schema `format` hint, e.g. `"email"`, `"uuid"`, `"date"`, `"date-time"`. */
  format?: string
  /** JSON Schema `pattern` (regex source). Zod emits a strict one for dates, so
   *  a date fixture's validity can be checked against it. */
  pattern?: string

  // -- number / integer ----------------------------------------------------
  minimum?: number
  maximum?: number
  /** When true, the matching bound is exclusive: the boundary value itself is invalid. */
  exclusiveMinimum?: boolean
  exclusiveMaximum?: boolean

  // -- enum / literal ------------------------------------------------------
  /** Allowed values when `type` is `enum`. A literal (`const`) is a one-member enum. */
  enumValues?: readonly unknown[]
  /** The scalar type of the enum members, where known (`string`, `number`, ...). */
  baseType?: FieldType

  // -- array ---------------------------------------------------------------
  /** Element spec when `type` is `array`. */
  items?: FieldSpec
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean

  // -- union ---------------------------------------------------------------
  /** Branch specs when `type` is `union` (from JSON Schema `anyOf` / `oneOf`). */
  anyOf?: FieldSpec[]
  /** True for `oneOf` (exactly-one) semantics, e.g. a discriminated union. */
  exclusive?: boolean
  /** For a discriminated union: the tag key and each branch's `const` tag value. */
  discriminant?: { key: string; values: unknown[] }
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
  pattern?: string
  enum?: unknown[]
  const?: unknown
  items?: JsonSchema
  prefixItems?: JsonSchema[]
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  [key: string]: unknown
}

/** A JSON Schema branch that only permits `null`. */
function isNullBranch(s: JsonSchema): boolean {
  return s.type === 'null'
}

/** True if a branch is an object schema with a declared property bag. */
function isObjectBranch(s: JsonSchema): boolean {
  const t = Array.isArray(s.type) ? s.type.includes('object') : s.type === 'object'
  return t && s.properties !== undefined
}

/**
 * For a set of object branches (a discriminated union), find a property that is
 * a `const` in every branch. That property is the discriminant, and its per-branch
 * const values are the recognized tags.
 */
function detectDiscriminant(branches: JsonSchema[]): { key: string; values: unknown[] } | undefined {
  if (branches.length < 2 || !branches.every(isObjectBranch)) return undefined
  const [first] = branches
  if (!first?.properties) return undefined
  for (const key of Object.keys(first.properties)) {
    const values: unknown[] = []
    let ok = true
    for (const branch of branches) {
      const prop = branch.properties?.[key]
      if (prop && 'const' in prop && prop.const !== undefined) values.push(prop.const)
      else {
        ok = false
        break
      }
    }
    if (ok) return { key, values }
  }
  return undefined
}

function scalarType(t: string | undefined): FieldType {
  switch (t) {
    case 'string':
      return 'string'
    case 'integer':
      return 'integer'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'array':
      return 'array'
    default:
      return 'unknown'
  }
}

/** The first non-`null` entry of a JSON Schema `type` (which may be an array). */
function primaryType(raw: JsonSchema): { type: string | undefined; nullable: boolean } {
  if (Array.isArray(raw.type)) {
    return { type: raw.type.find((x) => x !== 'null'), nullable: raw.type.includes('null') }
  }
  return { type: raw.type, nullable: false }
}

function applyStringBounds(spec: FieldSpec, raw: JsonSchema): void {
  if (typeof raw.minLength === 'number') spec.minLength = raw.minLength
  if (typeof raw.maxLength === 'number') spec.maxLength = raw.maxLength
  if (typeof raw.format === 'string') spec.format = raw.format
  if (typeof raw.pattern === 'string') spec.pattern = raw.pattern
}

function applyNumberBounds(spec: FieldSpec, raw: JsonSchema): void {
  // For integers an exclusive bound folds to the next inclusive integer (> 10 is >= 11).
  // For floats there is no next value, so keep the boundary and mark it exclusive so the
  // generator knows the boundary value itself must be rejected.
  if (typeof raw.minimum === 'number') spec.minimum = raw.minimum
  else if (typeof raw.exclusiveMinimum === 'number') {
    if (spec.type === 'integer') spec.minimum = raw.exclusiveMinimum + 1
    else {
      spec.minimum = raw.exclusiveMinimum
      spec.exclusiveMinimum = true
    }
  }
  if (typeof raw.maximum === 'number') spec.maximum = raw.maximum
  else if (typeof raw.exclusiveMaximum === 'number') {
    if (spec.type === 'integer') spec.maximum = raw.exclusiveMaximum - 1
    else {
      spec.maximum = raw.exclusiveMaximum
      spec.exclusiveMaximum = true
    }
  }
}

/** Reduce one JSON Schema node to a FieldSpec. Recurses for array items and union branches. */
function toFieldSpec(name: string, raw: JsonSchema, required: boolean): FieldSpec {
  // A non-object node (a bare scalar or array reached via a malformed schema) has
  // no constraints to read and must not hit the `in` / property access below.
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { name, type: 'unknown', required }
  }

  // 1. Union / nullable. anyOf and oneOf are both branch lists; oneOf is exclusive.
  const branchesRaw = raw.anyOf ?? raw.oneOf
  if (Array.isArray(branchesRaw) && branchesRaw.length > 0) {
    const nullable = branchesRaw.some(isNullBranch)
    const nonNull = branchesRaw.filter((b) => !isNullBranch(b))

    // A single non-null branch is just that type, made nullable (e.g. z.string().nullable()).
    const [firstBranch, ...restBranches] = nonNull
    if (firstBranch && restBranches.length === 0) {
      const inner = toFieldSpec(name, firstBranch, required)
      if (nullable) inner.nullable = true
      return inner
    }

    // A genuine union of two or more shapes.
    const spec: FieldSpec = {
      name,
      type: 'union',
      required,
      anyOf: nonNull.map((b) => toFieldSpec('', b, true)),
      exclusive: Array.isArray(raw.oneOf),
    }
    if (nullable) spec.nullable = true
    const discriminant = detectDiscriminant(nonNull)
    if (discriminant) spec.discriminant = discriminant
    return spec
  }

  const { type: primary, nullable } = primaryType(raw)

  // 2. Enum / literal. A fixed value set is a sharper constraint than the base type.
  if (Array.isArray(raw.enum) && raw.enum.length > 0) {
    return {
      name,
      type: 'enum',
      required,
      enumValues: raw.enum,
      baseType: scalarType(primary),
      ...(nullable ? { nullable: true } : {}),
    }
  }
  if ('const' in raw && raw.const !== undefined) {
    return {
      name,
      type: 'enum',
      required,
      enumValues: [raw.const],
      baseType: scalarType(primary),
      ...(nullable ? { nullable: true } : {}),
    }
  }

  // 3. Array.
  if (primary === 'array') {
    const spec: FieldSpec = { name, type: 'array', required }
    if (nullable) spec.nullable = true
    // A tuple is an array with prefixItems and a fixed arity. Derive the length
    // bounds from the arity (so it is not mistaken for an unbounded array) and
    // the element type from the first slot.
    const prefix = Array.isArray(raw.prefixItems) ? raw.prefixItems : undefined
    spec.items = toFieldSpec('', raw.items ?? prefix?.[0] ?? {}, true)
    if (typeof raw.minItems === 'number') spec.minItems = raw.minItems
    else if (prefix) spec.minItems = prefix.length
    if (typeof raw.maxItems === 'number') spec.maxItems = raw.maxItems
    else if (prefix) spec.maxItems = prefix.length
    if (typeof raw.uniqueItems === 'boolean') spec.uniqueItems = raw.uniqueItems
    return spec
  }

  // 4. Scalars.
  const spec: FieldSpec = { name, type: scalarType(primary), required }
  if (nullable) spec.nullable = true
  if (spec.type === 'string') applyStringBounds(spec, raw)
  else if (spec.type === 'number' || spec.type === 'integer') applyNumberBounds(spec, raw)

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
