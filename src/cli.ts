import { parseArgs } from 'node:util'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve, extname } from 'node:path'
import { adversary, fromJsonSchema, fromOpenApi, isOpenApiDocument, toMarkdown } from './index.js'
import type { Fixture, OpenApiFixtures, Technique } from './index.js'

/** Injectable IO so `run` is testable without touching the real process. */
export interface CliIO {
  stdout: (s: string) => void
  stderr: (s: string) => void
  cwd: string
}

const TECHNIQUES: Technique[] = ['BVA', 'EP', 'i18n', 'injection']

const HELP = `adversary - generate explained adversarial test inputs from a schema

Usage:
  adversary <source> [options]

<source>        A .ts/.js/.mjs/.cjs module exporting a Zod (v4) schema, a .json
                file containing a JSON Schema, or an OpenAPI 3.x document (.json,
                or .yaml/.yml with the optional "yaml" package). An OpenAPI doc is
                reported per operation (each request body and its parameters).

Options:
  --report            Output a Markdown risk report instead of JSON fixtures
  --export <name>     Named export to use as the schema (default: the default
                      export, else the sole schema-like export)
  --technique <t>     Only these techniques (repeatable or comma-separated):
                      BVA, EP, i18n, injection
  --field <name>      Only these fields (repeatable or comma-separated)
  --title <text>      Title for the Markdown report
  -h, --help          Show this help
  -v, --version       Show version

Examples:
  adversary ./schema.ts --report
  adversary ./schema.ts --technique injection,i18n
  adversary ./openapi.json --report
  adversary ./openapi.yaml --technique injection

Notes:
  In JSON output, non-representable values are encoded so nothing is silently
  lost: the 'absent' probe becomes null, and NaN / Infinity / -Infinity / -0
  become those literal strings.
`

async function version(): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version?: string }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function isSchemaLike(x: unknown): boolean {
  return typeof (x as { toJSONSchema?: unknown } | null)?.toJSONSchema === 'function'
}

/** Choose which export of a loaded module is the schema, failing loudly on ambiguity. */
function pickExport(mod: Record<string, unknown>, name: string | undefined): unknown {
  if (name !== undefined) {
    if (mod[name] === undefined) throw new Error(`export "${name}" not found in the module`)
    return mod[name]
  }
  if (isSchemaLike(mod.default)) return mod.default
  const schemaKeys = Object.keys(mod).filter((k) => isSchemaLike(mod[k]))
  if (schemaKeys.length === 1) return mod[schemaKeys[0] as string]
  if (schemaKeys.length > 1) {
    throw new Error(`multiple schema-like exports found (${schemaKeys.join(', ')}); pass --export <name> to choose one`)
  }
  return mod.default // undefined here; the caller reports "no schema export"
}

/** Split repeated and comma-separated option values into a flat, trimmed list. */
function flatten(values: string[] | undefined): string[] {
  return (values ?? []).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean)
}

/**
 * Encode values JSON cannot represent so the default output never silently lies:
 * undefined (the 'absent' probe) becomes null, and NaN / +-Infinity / -0 become
 * their literal strings. Consumers revive these rather than testing null/0.
 */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN'
    if (value === Infinity) return 'Infinity'
    if (value === -Infinity) return '-Infinity'
    if (Object.is(value, -0)) return '-0'
    return value
  }
  if (typeof value === 'bigint') return value.toString()
  return value === undefined ? null : value
}

/** The two shapes a source can reduce to: a flat schema, or an OpenAPI doc grouped by operation. */
type Loaded = { kind: 'flat'; fixtures: Fixture[] } | { kind: 'openapi'; groups: OpenApiFixtures[] }

const DATA_EXTS = new Set(['.json', '.yaml', '.yml'])

/** Parse a data file (JSON, or YAML via the optional `yaml` package). */
async function parseData(file: string, abs: string, ext: string): Promise<unknown> {
  let text: string
  try {
    text = await readFile(abs, 'utf8')
  } catch (e) {
    throw new Error(`could not read ${file}: ${(e as Error).message}`)
  }
  if (ext === '.json') {
    try {
      return JSON.parse(text)
    } catch (e) {
      throw new Error(`could not parse ${file} as JSON: ${(e as Error).message}`)
    }
  }
  let yaml: { parse(s: string): unknown }
  try {
    // The specifier is kept in a variable so the optional dependency is resolved at
    // runtime from the user's project, not required at build time.
    const moduleName = 'yaml'
    yaml = (await import(moduleName)) as { parse(s: string): unknown }
  } catch {
    throw new Error(`reading ${file} needs the optional "yaml" package - run: npm i -D yaml (or convert the spec to .json)`)
  }
  try {
    return yaml.parse(text)
  } catch (e) {
    throw new Error(`could not parse ${file} as YAML: ${(e as Error).message}`)
  }
}

/** Load a source file and return all fixtures it produces (unfiltered). */
async function load(file: string, cwd: string, exportName: string | undefined): Promise<Loaded> {
  const abs = resolve(cwd, file)
  const ext = extname(abs).toLowerCase()

  if (DATA_EXTS.has(ext)) {
    const data = await parseData(file, abs, ext)
    if (isOpenApiDocument(data)) return { kind: 'openapi', groups: fromOpenApi(data) }
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error(`${file} is not a JSON Schema object or an OpenAPI document`)
    }
    return { kind: 'flat', fixtures: fromJsonSchema(data) }
  }

  let mod: Record<string, unknown>
  try {
    mod = (await import(pathToFileURL(abs).href)) as Record<string, unknown>
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    const stripUnavailable =
      ext === '.ts' &&
      (err.code === 'ERR_UNKNOWN_FILE_EXTENSION' || /unknown file extension/i.test(err.message ?? ''))
    const hint = stripUnavailable
      ? '\n(hint: importing .ts needs Node >= 22.18 with type stripping; otherwise point at a .js/.mjs or .json schema)'
      : ''
    throw new Error(`could not load ${file}: ${(e as Error).message}${hint}`)
  }

  const schema = pickExport(mod, exportName)
  if (schema === undefined) {
    throw new Error(`no schema export found in ${file} (default-export a Zod schema, or pass --export <name>)`)
  }
  return { kind: 'flat', fixtures: adversary(schema as Parameters<typeof adversary>[0]) }
}

/**
 * Run the CLI. Returns an exit code and writes through the injected IO, so it is
 * unit-testable without spawning a process. 0 success, 1 runtime error (bad
 * schema/file), 2 usage error (bad arguments).
 */
export async function run(argv: string[], io: Partial<CliIO> = {}): Promise<number> {
  const out = io.stdout ?? ((s: string) => void process.stdout.write(s))
  const err = io.stderr ?? ((s: string) => void process.stderr.write(s))
  const cwd = io.cwd ?? process.cwd()

  let values: {
    report?: boolean
    export?: string
    technique?: string[]
    field?: string[]
    title?: string
    help?: boolean
    version?: boolean
  }
  let positionals: string[]
  try {
    ;({ values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        report: { type: 'boolean' },
        export: { type: 'string' },
        technique: { type: 'string', multiple: true },
        field: { type: 'string', multiple: true },
        title: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    }))
  } catch (e) {
    err(`adversary: ${(e as Error).message}\n\n`)
    err(HELP)
    return 2
  }

  if (values.help) {
    out(HELP)
    return 0
  }
  if (values.version) {
    out(`${await version()}\n`)
    return 0
  }

  const file = positionals[0]
  if (file === undefined) {
    err('adversary: missing schema file\n\n')
    err(HELP)
    return 2
  }
  if (positionals.length > 1) {
    err(`adversary: unexpected extra argument(s): ${positionals.slice(1).join(', ')} (one schema file at a time)\n`)
    return 2
  }

  const ext = extname(resolve(cwd, file)).toLowerCase()
  if (DATA_EXTS.has(ext) && values.export !== undefined) {
    err('adversary: --export selects a named module export and does not apply to a JSON or OpenAPI file\n')
    return 2
  }

  const techniques = flatten(values.technique)
  if (values.technique !== undefined && techniques.length === 0) {
    err(`adversary: empty --technique value (expected one of ${TECHNIQUES.join(', ')})\n`)
    return 2
  }
  for (const t of techniques) {
    if (!(TECHNIQUES as string[]).includes(t)) {
      err(`adversary: unknown technique "${t}" (expected one of ${TECHNIQUES.join(', ')})\n`)
      return 2
    }
  }

  const fields = flatten(values.field)
  if (values.field !== undefined && fields.length === 0) {
    err('adversary: empty --field value\n')
    return 2
  }

  let loaded: Loaded
  try {
    loaded = await load(file, cwd, values.export)
  } catch (e) {
    err(`adversary: ${(e as Error).message}\n`)
    return 1
  }

  const techniqueSet = techniques.length > 0 ? new Set(techniques) : null
  const fieldSet = fields.length > 0 ? new Set(fields) : null
  const keep = (f: Fixture): boolean =>
    (techniqueSet === null || techniqueSet.has(f.technique)) && (fieldSet === null || fieldSet.has(f.field))

  // Validate requested field names against the actual fields (the union across
  // operations for OpenAPI), before filtering, so a technique filter that legitimately
  // empties a field is not mistaken for a typo.
  if (fields.length > 0) {
    const everyFixture = loaded.kind === 'flat' ? loaded.fixtures : loaded.groups.flatMap((g) => g.fixtures)
    const available = [...new Set(everyFixture.map((f) => f.field))]
    const missing = fields.filter((f) => !available.includes(f))
    if (missing.length > 0) {
      err(`adversary: unknown field ${missing.map((f) => `"${f}"`).join(', ')} (available: ${available.join(', ')})\n`)
      return 2
    }
  }

  if (loaded.kind === 'openapi') {
    const groups = loaded.groups
      .map((g) => ({ ...g, fixtures: g.fixtures.filter(keep) }))
      .filter((g) => g.fixtures.length > 0)
    if (values.report) {
      out(groups.map((g) => toMarkdown(g.fixtures, { title: `${g.method} ${g.path} (${g.source})` })).join('\n'))
    } else {
      out(`${JSON.stringify(groups, jsonReplacer, 2)}\n`)
    }
    return 0
  }

  const fixtures = loaded.fixtures.filter(keep)
  if (values.report) {
    out(toMarkdown(fixtures, values.title !== undefined ? { title: values.title } : {}))
  } else {
    out(`${JSON.stringify(fixtures, jsonReplacer, 2)}\n`)
  }
  return 0
}
