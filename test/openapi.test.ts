import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { fromOpenApi, isOpenApiDocument } from '../src/index.js'
import { run } from '../src/cli.js'
import type { Fixture } from '../src/index.js'

const doc = {
  openapi: '3.1.0',
  paths: {
    '/webhooks': {
      post: { requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Webhook' } } } } },
    },
    '/users/{id}': {
      get: {
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'note', in: 'query', schema: { type: 'string', nullable: true } },
        ],
      },
    },
  },
  components: {
    schemas: { Webhook: { type: 'object', properties: { callbackUrl: { type: 'string', format: 'uri' } }, required: ['callbackUrl'] } },
  },
}

describe('fromOpenApi', () => {
  it('recognizes an OpenAPI document', () => {
    expect(isOpenApiDocument(doc)).toBe(true)
    expect(isOpenApiDocument({ type: 'object' })).toBe(false)
    expect(isOpenApiDocument(null)).toBe(false)
  })

  it('extracts request body and parameters grouped per operation, resolving $ref', () => {
    const groups = fromOpenApi(doc)
    const body = groups.find((g) => g.method === 'POST' && g.path === '/webhooks' && g.source === 'body')
    expect(body).toBeDefined()
    // the url pack reached the $ref-resolved callbackUrl field
    expect(body!.fixtures.some((f) => f.field === 'callbackUrl' && f.family === 'javascript-scheme')).toBe(true)

    const params = groups.find((g) => g.path === '/users/{id}' && g.source === 'params')
    expect(params).toBeDefined()
    expect(params!.fixtures.some((f) => f.field === 'id' && f.family === 'nil-uuid')).toBe(true) // uuid pack
  })

  it('folds OpenAPI 3.0 nullable into a valid null', () => {
    const params = fromOpenApi(doc).find((g) => g.source === 'params')!
    const noteNull = params.fixtures.find((f) => f.field === 'note' && f.family === 'null')!
    expect(noteNull.validity).toBe('valid') // nullable: true -> null is allowed
  })

  it('passes options through (technique filter)', () => {
    const groups = fromOpenApi(doc, { techniques: ['injection'] })
    expect(groups.every((g) => g.fixtures.every((f) => f.technique === 'injection'))).toBe(true)
    expect(groups.length).toBeGreaterThan(0)
  })

  it('throws on a non-OpenAPI argument', () => {
    expect(() => fromOpenApi({ type: 'object' })).toThrow(/OpenAPI/)
  })
})

describe('cli: OpenAPI input', () => {
  const fixturesDir = fileURLToPath(new URL('./fixtures/', import.meta.url))
  const cli = async (argv: string[]) => {
    let stdout = ''
    let stderr = ''
    const code = await run(argv, { stdout: (s) => (stdout += s), stderr: (s) => (stderr += s), cwd: fixturesDir })
    return { code, stdout, stderr }
  }

  it('outputs fixtures grouped per operation for a .json OpenAPI doc', async () => {
    const { code, stdout } = await cli(['openapi.json', '--technique', 'injection'])
    expect(code).toBe(0)
    const groups = JSON.parse(stdout) as Array<{ method: string; path: string; source: string; fixtures: Fixture[] }>
    expect(groups.some((g) => g.method === 'POST' && g.path === '/webhooks' && g.source === 'body')).toBe(true)
    expect(groups.some((g) => g.source === 'params' && g.fixtures.length > 0)).toBe(true)
  })

  it('renders a per-operation Markdown report', async () => {
    const { code, stdout } = await cli(['openapi.json', '--report', '--technique', 'injection'])
    expect(code).toBe(0)
    expect(stdout).toContain('# POST /webhooks (body)')
    expect(stdout).toContain('# GET /users/{id} (params)')
  })

  it('reads a .yaml OpenAPI doc via the optional yaml package', async () => {
    const { code, stdout } = await cli(['openapi.yaml', '--technique', 'injection'])
    expect(code).toBe(0)
    const groups = JSON.parse(stdout) as Array<{ method: string; path: string; source: string; fixtures: Fixture[] }>
    expect(groups.some((g) => g.method === 'POST' && g.path === '/webhooks' && g.source === 'body')).toBe(true)
  })
})
