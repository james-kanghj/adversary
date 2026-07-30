import { schemaToSpec, isSchemaLike, type SchemaLike } from './introspect.js'
import { jsonSchemaToSpec, type SchemaSpec } from './schema-spec.js'
import { stringFixtures } from './generators/string.js'
import { numberFixtures } from './generators/number.js'
import { enumFixtures } from './generators/enum.js'
import type { Fixture, Technique } from './types.js'

export type { Fixture, Technique, Validity, CatalogEntry } from './types.js'
export type { FieldSpec, SchemaSpec, FieldType } from './schema-spec.js'
export type { SchemaLike } from './introspect.js'
export { catalog } from './catalog.js'
export { toMarkdown, type MarkdownOptions } from './report.js'
export { jsonSchemaToSpec } from './schema-spec.js'

export interface AdversaryOptions {
  /** Only include these techniques. */
  techniques?: Technique[]
  /** Only generate fixtures for these field names. */
  fields?: string[]
}

/**
 * Generate explained adversarial inputs from a self-describing schema (e.g. a
 * Zod v4 schema). Returns a flat array of {@link Fixture}s ready to drop into a
 * `test.each` table or to render with {@link toMarkdown}.
 */
export function adversary(schema: SchemaLike, opts?: AdversaryOptions): Fixture[] {
  if (!isSchemaLike(schema)) {
    throw new TypeError(
      'adversary(schema): expected a schema exposing a toJSONSchema() method (e.g. a Zod v4 schema). ' +
        'For a plain JSON Schema object, use fromJsonSchema() instead.',
    )
  }
  return generate(schemaToSpec(schema), opts)
}

/** Same as {@link adversary}, but from a plain JSON Schema object - no Zod required. */
export function fromJsonSchema(json: unknown, opts?: AdversaryOptions): Fixture[] {
  return generate(jsonSchemaToSpec(json), opts)
}

function generate(spec: SchemaSpec, opts?: AdversaryOptions): Fixture[] {
  const fieldFilter = opts?.fields ? new Set(opts.fields) : null
  const techFilter = opts?.techniques ? new Set(opts.techniques) : null

  const out: Fixture[] = []
  for (const field of spec.fields) {
    if (fieldFilter && !fieldFilter.has(field.name)) continue
    if (field.type === 'string') out.push(...stringFixtures(field))
    else if (field.type === 'number' || field.type === 'integer') out.push(...numberFixtures(field))
    else if (field.type === 'enum') out.push(...enumFixtures(field))
    // boolean / array / union / unknown fields yield no fixtures yet.
  }

  return techFilter ? out.filter((f) => techFilter.has(f.technique)) : out
}
