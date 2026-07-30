import type { Fixture, Technique } from './types.js'

const TECHNIQUE_ORDER: Technique[] = ['injection', 'i18n', 'BVA', 'EP']

const TECHNIQUE_HEADING: Record<Technique, string> = {
  injection: 'Injection',
  i18n: 'Internationalization / Unicode',
  BVA: 'Boundary values',
  EP: 'Equivalence classes',
}

/**
 * Escape a string so the exact code points survive: everything outside printable
 * ASCII becomes a `\u` escape. This keeps invisible and bidi characters from
 * corrupting the report - the same discipline the catalog itself follows.
 */
function escapeNonAscii(s: string): string {
  let out = ''
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number
    if (cp < 0x20 || cp > 0x7e) {
      out += cp > 0xffff ? `\\u{${cp.toString(16).toUpperCase()}}` : `\\u${cp.toString(16).toUpperCase().padStart(4, '0')}`
    } else {
      out += ch
    }
  }
  return out
}

/**
 * Render a value for the report. Strings are quoted and escaped; other values
 * (numbers, booleans, null, undefined, arrays, objects) are shown in a JSON-ish
 * form with any non-ASCII inside still escaped, so an array of hostile strings
 * cannot smuggle a bidi or invisible character into the output.
 */
function render(value: unknown): string {
  if (typeof value === 'string') return `"${escapeNonAscii(value)}"`
  if (value === undefined) return 'undefined'
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    const json = JSON.stringify(value)
    return json === undefined ? String(value) : escapeNonAscii(json)
  } catch {
    return String(value)
  }
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const bucket = map.get(k)
    if (bucket) bucket.push(item)
    else map.set(k, [item])
  }
  return map
}

export interface MarkdownOptions {
  title?: string
}

/**
 * Turn fixtures into a risk-ranked Markdown report: grouped by field, then by
 * technique (injection first, boundary/equivalence last), every case carrying
 * its failure hypothesis. Suitable to paste into a PR, a test charter, or a wiki.
 */
export function toMarkdown(fixtures: Fixture[], opts: MarkdownOptions = {}): string {
  const lines: string[] = []
  lines.push(`# ${opts.title ?? 'Adversarial report'}`)
  lines.push('')

  const fieldCount = new Set(fixtures.map((f) => f.field)).size
  lines.push(`${fixtures.length} adversarial input${fixtures.length === 1 ? '' : 's'} across ${fieldCount} field${fieldCount === 1 ? '' : 's'}.`)
  lines.push('')

  for (const [field, fieldFixtures] of groupBy(fixtures, (f) => f.field)) {
    lines.push(`## Field: \`${field || '(root)'}\``)
    lines.push('')

    const byTechnique = groupBy(fieldFixtures, (f) => f.technique)
    const techniques = TECHNIQUE_ORDER.filter((t) => byTechnique.has(t))

    for (const technique of techniques) {
      lines.push(`### ${TECHNIQUE_HEADING[technique]}`)
      lines.push('')
      for (const fx of byTechnique.get(technique) as Fixture[]) {
        const validity = fx.valid === 'unknown' ? '' : ` _(${fx.valid})_`
        const len = typeof fx.value === 'string' ? ` (len ${fx.value.length})` : ''
        lines.push(`- **${fx.family}** \`${render(fx.value)}\`${len}${validity}`)
        lines.push(`  ${fx.failureHypothesis}`)
      }
      lines.push('')
    }
  }

  return lines.join('\n').trimEnd() + '\n'
}
