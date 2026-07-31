import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { run } from '../src/cli.js'
import type { Fixture } from '../src/index.js'

const fixturesDir = fileURLToPath(new URL('./fixtures/', import.meta.url))

async function cli(argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = ''
  let stderr = ''
  const code = await run(argv, { stdout: (s) => (stdout += s), stderr: (s) => (stderr += s), cwd: fixturesDir })
  return { code, stdout, stderr }
}

const parse = (s: string): Fixture[] => JSON.parse(s) as Fixture[]

describe('cli', () => {
  it('outputs JSON fixtures for a JSON Schema file', async () => {
    const { code, stdout } = await cli(['user.schema.json'])
    expect(code).toBe(0)
    const fx = parse(stdout)
    expect(Array.isArray(fx)).toBe(true)
    expect(fx.some((f) => f.field === 'name')).toBe(true)
  })

  it('renders a Markdown report with --report', async () => {
    const { code, stdout } = await cli(['user.schema.json', '--report'])
    expect(code).toBe(0)
    expect(stdout).toContain('# Adversarial report')
    expect(stdout).toContain('## Field: `name`')
  })

  it('loads a default-exported Zod schema from an .mjs module, including enum handling', async () => {
    const { code, stdout } = await cli(['user.schema.mjs'])
    expect(code).toBe(0)
    const fx = parse(stdout)
    expect(fx.some((f) => f.field === 'role' && f.family === 'out-of-set')).toBe(true)
  })

  it('filters by technique (comma-separated)', async () => {
    const { code, stdout } = await cli(['user.schema.mjs', '--technique', 'injection,i18n'])
    expect(code).toBe(0)
    const fx = parse(stdout)
    expect(fx.length).toBeGreaterThan(0)
    expect(fx.every((f) => f.technique === 'injection' || f.technique === 'i18n')).toBe(true)
  })

  it('filters by field', async () => {
    const { stdout } = await cli(['user.schema.mjs', '--field', 'age'])
    expect(parse(stdout).every((f) => f.field === 'age')).toBe(true)
  })

  it('represents the absent probe as null in JSON (undefined cannot survive JSON)', async () => {
    const { stdout } = await cli(['user.schema.mjs', '--field', 'name'])
    const absent = parse(stdout).find((f) => f.family === 'absent')
    expect(absent).toBeDefined()
    expect(absent?.value).toBe(null)
  })

  it('encodes NaN / Infinity / -0 as sentinel strings instead of losing them to null/0', async () => {
    const { stdout } = await cli(['user.schema.mjs', '--field', 'age'])
    const fx = parse(stdout)
    expect(fx.find((f) => f.family === 'nan')?.value).toBe('NaN')
    expect(fx.find((f) => f.family === 'positive-infinity')?.value).toBe('Infinity')
    expect(fx.find((f) => f.family === 'negative-infinity')?.value).toBe('-Infinity')
    expect(fx.find((f) => f.family === 'negative-zero')?.value).toBe('-0')
    // and plain zero stays a real number, distinct from negative-zero
    expect(fx.find((f) => f.family === 'zero')?.value).toBe(0)
  })

  it('rejects a .json whose top-level value is not a schema object (exit 1, clear message)', async () => {
    const { code, stderr } = await cli(['scalar.json'])
    expect(code).toBe(1)
    expect(stderr).toMatch(/not a JSON Schema object/)
  })

  it('rejects --export on a .json file (exit 2)', async () => {
    const { code, stderr } = await cli(['user.schema.json', '--export', 'Foo'])
    expect(code).toBe(2)
    expect(stderr).toMatch(/--export/)
  })

  it('refuses to guess between multiple schema exports with no default (exit 1)', async () => {
    const { code, stderr } = await cli(['multi.mjs'])
    expect(code).toBe(1)
    expect(stderr).toMatch(/multiple schema-like exports/)
    expect(stderr).toContain('--export')
  })

  it('selects a named export from a multi-export module', async () => {
    const { code, stdout } = await cli(['multi.mjs', '--export', 'Alpha'])
    expect(code).toBe(0)
    expect(parse(stdout).every((f) => f.field === 'a')).toBe(true)
  })

  it('rejects an unknown --field with the available field names (exit 2)', async () => {
    const { code, stderr } = await cli(['user.schema.mjs', '--field', 'naem'])
    expect(code).toBe(2)
    expect(stderr).toMatch(/unknown field/)
    expect(stderr).toContain('name')
  })

  it('rejects an extra positional argument (exit 2)', async () => {
    const { code, stderr } = await cli(['user.schema.mjs', 'extra.mjs'])
    expect(code).toBe(2)
    expect(stderr).toMatch(/extra argument/)
  })

  it('errors (exit 2) on an unknown technique', async () => {
    const { code, stderr } = await cli(['user.schema.mjs', '--technique', 'sql'])
    expect(code).toBe(2)
    expect(stderr).toContain('unknown technique')
  })

  it('errors (exit 2) when no schema file is given', async () => {
    const { code, stderr } = await cli([])
    expect(code).toBe(2)
    expect(stderr).toContain('missing schema file')
  })

  it('errors (exit 1) when the module has no schema export', async () => {
    const { code, stderr } = await cli(['empty.mjs'])
    expect(code).toBe(1)
    expect(stderr).toContain('no schema export')
  })

  it('errors (exit 1) with a clear message when the file does not exist', async () => {
    const { code, stderr } = await cli(['nope.json'])
    expect(code).toBe(1)
    expect(stderr).toMatch(/could not read|ENOENT/i)
  })

  it('supports --help and --version', async () => {
    const help = await cli(['--help'])
    expect(help.code).toBe(0)
    expect(help.stdout).toContain('Usage:')

    const ver = await cli(['--version'])
    expect(ver.code).toBe(0)
    expect(ver.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
