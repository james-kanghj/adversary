import { parseArgs } from 'node:util'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve, extname } from 'node:path'
import { adversary, fromJsonSchema, toMarkdown } from './index.js'
import type { Fixture, Technique } from './index.js'

/** Injectable IO so `run` is testable without touching the real process. */
export interface CliIO {
  stdout: (s: string) => void
  stderr: (s: string) => void
  cwd: string
}

const TECHNIQUES: Technique[] = ['BVA', 'EP', 'i18n', 'injection']

const HELP = `adversary - generate explained adversarial test inputs from a schema

Usage:
  adversary <schema-file> [options]

<schema-file>   A .ts/.js/.mjs/.cjs module exporting a Zod (v4) schema, or a
                .json file containing a JSON Schema.

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
  adversary ./api.schema.json --field email

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

/** Load a schema file and return all fixtures it produces (unfiltered). */
async function generate(file: string, cwd: string, exportName: string | undefined): Promise<Fixture[]> {
  const abs = resolve(cwd, file)
  const ext = extname(abs).toLowerCase()

  if (ext === '.json') {
    let json: unknown
    try {
      json = JSON.parse(await readFile(abs, 'utf8'))
    } catch (e) {
      throw new Error(`could not read JSON Schema ${file}: ${(e as Error).message}`)
    }
    if (json === null || typeof json !== 'object' || Array.isArray(json)) {
      throw new Error(`${file} is not a JSON Schema object`)
    }
    return fromJsonSchema(json)
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
  return adversary(schema as Parameters<typeof adversary>[0])
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
  if (ext === '.json' && values.export !== undefined) {
    err('adversary: --export selects a named module export and does not apply to a .json schema file\n')
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

  let all: Fixture[]
  try {
    all = await generate(file, cwd, values.export)
  } catch (e) {
    err(`adversary: ${(e as Error).message}\n`)
    return 1
  }

  // Validate requested fields against the schema's actual fields (before filtering,
  // so a technique filter that legitimately empties a field is not mistaken for a typo).
  if (fields.length > 0) {
    const available = [...new Set(all.map((f) => f.field))]
    const unknown = fields.filter((f) => !available.includes(f))
    if (unknown.length > 0) {
      err(`adversary: unknown field ${unknown.map((f) => `"${f}"`).join(', ')} (available: ${available.join(', ')})\n`)
      return 2
    }
  }

  const techniqueSet = techniques.length > 0 ? new Set(techniques) : null
  const fieldSet = fields.length > 0 ? new Set(fields) : null
  const fixtures = all.filter(
    (f) => (techniqueSet === null || techniqueSet.has(f.technique)) && (fieldSet === null || fieldSet.has(f.field)),
  )

  if (values.report) {
    out(toMarkdown(fixtures, values.title !== undefined ? { title: values.title } : {}))
  } else {
    out(`${JSON.stringify(fixtures, jsonReplacer, 2)}\n`)
  }
  return 0
}
