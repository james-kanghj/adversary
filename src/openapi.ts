/**
 * Extract the request-body and parameter schemas from an OpenAPI 3.x document so
 * adversary can generate fixtures per endpoint - the entry point for QA who have
 * an API spec but no Zod schema. This module only reduces an OpenAPI doc to a list
 * of plain JSON Schema objects (resolving internal $refs and folding OpenAPI 3.0's
 * `nullable`); fixture generation happens in index.ts via fromJsonSchema.
 */

/** A JSON Schema extracted from one operation of an OpenAPI document. */
export interface OpenApiSchemaRef {
  /** Uppercase HTTP method, e.g. "POST". */
  method: string
  /** The path template, e.g. "/users/{id}". */
  path: string
  /** Where the schema came from: the JSON request body, or the operation's parameters. */
  source: 'body' | 'params'
  /** A plain JSON Schema object, with internal $refs resolved and `nullable` folded. */
  schema: Record<string, unknown>
}

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']

type Obj = Record<string, unknown>

const isObj = (x: unknown): x is Obj => x !== null && typeof x === 'object' && !Array.isArray(x)

/** True for an OpenAPI 3.x (or Swagger 2.0) document. */
export function isOpenApiDocument(x: unknown): boolean {
  return isObj(x) && (typeof x.openapi === 'string' || typeof x.swagger === 'string')
}

/** Follow a `#/a/b/c` JSON pointer within the document. */
function resolvePointer(doc: unknown, ref: string): unknown {
  if (!ref.startsWith('#/')) return undefined // external refs are unsupported
  let node: unknown = doc
  for (const raw of ref.slice(2).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~')
    if (!isObj(node) && !Array.isArray(node)) return undefined
    node = (node as Obj)[key]
  }
  return node
}

/** Recursively inline internal $refs (guarding cycles) and fold OpenAPI 3.0 `nullable`. */
function normalize(node: unknown, doc: unknown, seen: ReadonlySet<string>): unknown {
  if (Array.isArray(node)) return node.map((n) => normalize(n, doc, seen))
  if (!isObj(node)) return node

  if (typeof node.$ref === 'string') {
    if (seen.has(node.$ref)) return {} // a cycle: treat as unconstrained
    const target = resolvePointer(doc, node.$ref)
    if (target === undefined) return {}
    return normalize(target, doc, new Set(seen).add(node.$ref))
  }

  const out: Obj = {}
  for (const [k, v] of Object.entries(node)) {
    if (k === 'nullable') continue
    out[k] = normalize(v, doc, seen)
  }
  // OpenAPI 3.0: `nullable: true` becomes a union with null, which the reducer understands.
  if (node.nullable === true && typeof node.type === 'string') out.type = [node.type, 'null']
  return out
}

const clean = (schema: unknown, doc: unknown): Obj => {
  const r = normalize(schema, doc, new Set())
  return isObj(r) ? r : {}
}

/**
 * Reduce an OpenAPI document to the JSON Schemas worth attacking: each operation's
 * JSON request body and its parameters (path/query/header/cookie). Throws if the
 * document is not OpenAPI.
 */
export function openApiSchemas(doc: unknown): OpenApiSchemaRef[] {
  if (!isOpenApiDocument(doc)) {
    throw new TypeError('fromOpenApi(doc): expected an OpenAPI 3.x document (an object with an "openapi" or "swagger" field).')
  }
  const out: OpenApiSchemaRef[] = []
  const paths = isObj((doc as Obj).paths) ? ((doc as Obj).paths as Obj) : {}

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isObj(pathItem)) continue
    const sharedParams = Array.isArray(pathItem.parameters) ? pathItem.parameters : []

    for (const method of HTTP_METHODS) {
      const op = pathItem[method]
      if (!isObj(op)) continue
      const METHOD = method.toUpperCase()

      // Request body (application/json).
      const bodySchema = isObj(op.requestBody)
        ? ((op.requestBody.content as Obj | undefined)?.['application/json'] as Obj | undefined)?.schema
        : undefined
      if (bodySchema !== undefined) {
        out.push({ method: METHOD, path, source: 'body', schema: clean(bodySchema, doc) })
      }

      // Parameters, collapsed into a single object schema keyed by parameter name.
      const params = [...sharedParams, ...(Array.isArray(op.parameters) ? op.parameters : [])]
      const properties: Obj = {}
      const required: string[] = []
      for (const raw of params) {
        const p = clean(raw, doc)
        if (typeof p.name !== 'string' || p.schema === undefined) continue
        properties[p.name] = clean(p.schema, doc)
        if (p.required === true) required.push(p.name)
      }
      if (Object.keys(properties).length > 0) {
        out.push({ method: METHOD, path, source: 'params', schema: { type: 'object', properties, required } })
      }
    }
  }

  return out
}
