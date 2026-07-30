import { describe, it, expect } from 'vitest'
import { catalog } from '../src/index.js'

/** Build a string from code points - keeps this test file pure ASCII and
 * immune to any source-file normalization of literal characters. */
const cp = (...points: number[]) => String.fromCodePoint(...points)

const byFamily = (family: string) => {
  const entry = catalog.find((e) => e.family === family)
  if (!entry) throw new Error(`no catalog entry for family "${family}"`)
  return entry
}

describe('catalog integrity', () => {
  it('every entry is well-formed', () => {
    for (const e of catalog) {
      expect(typeof e.value).toBe('string')
      expect(e.value.length).toBeGreaterThan(0)
      expect(['i18n', 'injection']).toContain(e.technique)
      expect(e.family).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(e.failureHypothesis.trim().length).toBeGreaterThan(20)
    }
  })

  it('has no duplicate values', () => {
    const values = catalog.map((e) => e.value)
    expect(new Set(values).size).toBe(values.length)
  })

  it('covers the essential injection families', () => {
    const families = new Set(catalog.map((e) => e.family))
    for (const fam of ['sql-injection', 'xss', 'template-injection', 'path-traversal', 'crlf-injection']) {
      expect(families.has(fam)).toBe(true)
    }
  })
})

// These tests double as executable documentation: each asserts the exact claim
// the corresponding failureHypothesis makes about the value.
describe('catalog claims are true', () => {
  it('the family emoji is one grapheme but 11 UTF-16 code units', () => {
    const e = byFamily('grapheme-vs-codeunit')
    expect(e.value.length).toBe(11) // code units
    expect([...e.value].length).toBeLessThan(e.value.length) // fewer code points (surrogate pairs)
  })

  it('the NFD "cafe" is 5 code units and normalizes to the 4-unit NFC form', () => {
    const e = byFamily('unicode-normalization')
    const nfc = 'caf' + cp(0xe9) // precomposed "café"
    expect(e.value.length).toBe(5)
    expect(e.value).not.toBe(nfc)
    expect(e.value.normalize('NFC')).toBe(nfc)
    expect(nfc.length).toBe(4)
  })

  it('the homoglyph reads like "admin" yet is a different string', () => {
    const e = byFamily('homoglyph')
    expect(e.value).not.toBe('admin')
    expect(e.value.length).toBe('admin'.length)
  })

  it('the null-byte payload actually contains U+0000', () => {
    const e = byFamily('null-byte')
    expect(e.value.includes(cp(0x0000))).toBe(true)
  })

  it('the bidi override actually contains U+202E', () => {
    const e = byFamily('bidi-override')
    expect(e.value.includes(cp(0x202e))).toBe(true)
  })

  it('the invisible-whitespace value contains a zero-width space (U+200B)', () => {
    const e = byFamily('invisible-whitespace')
    expect(e.value.includes(cp(0x200b))).toBe(true)
  })

  it('the non-breaking-space value looks like spaces but is a distinct code point', () => {
    const e = byFamily('non-breaking-space')
    expect(e.value.includes(cp(0x00a0))).toBe(true)
    // It resembles " admin " but the surrounding chars are U+00A0, not ASCII space.
    expect(e.value).not.toBe(' admin ')
    // Note: JS trim() DOES strip U+00A0. The divergence the entry warns about is
    // cross-layer (Postgres trim() / Java String.trim() keep it), not within JS.
    expect(e.value.trim()).toBe('admin')
  })

  it('the astral-plane value lives entirely outside the BMP', () => {
    const e = byFamily('astral-plane')
    for (const ch of e.value) {
      expect(ch.codePointAt(0) as number).toBeGreaterThan(0xffff)
    }
  })
})
