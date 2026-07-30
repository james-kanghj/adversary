import { jsonSchemaToSpec, type SchemaSpec } from './schema-spec.js'

/**
 * Anything that can describe itself as JSON Schema. A Zod v4 schema satisfies
 * this structurally via its `toJSONSchema()` method, so adversary needs no
 * import of - and no hard dependency on - Zod itself.
 */
export interface SchemaLike {
  toJSONSchema: (opts?: { unrepresentable?: 'any' | 'throw' }) => unknown
}

export function isSchemaLike(x: unknown): x is SchemaLike {
  return typeof (x as { toJSONSchema?: unknown } | null)?.toJSONSchema === 'function'
}

/**
 * Reduce a self-describing schema (e.g. a Zod v4 schema) to adversary's internal
 * field spec. Unrepresentable pieces (dates, functions, ...) are tolerated rather
 * than thrown - adversary just has no fixtures to offer for those fields.
 */
export function schemaToSpec(schema: SchemaLike): SchemaSpec {
  let json: unknown
  try {
    json = schema.toJSONSchema({ unrepresentable: 'any' })
  } catch {
    json = schema.toJSONSchema()
  }
  return jsonSchemaToSpec(json)
}
