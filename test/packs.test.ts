import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { adversary, packs } from '../src/index.js'

const byFamily = (pack: string, family: string) => {
  const entry = (packs[pack] ?? []).find((e) => e.family === family)
  if (!entry) throw new Error(`no ${pack} pack entry for family "${family}"`)
  return entry
}

describe('format-aware pack injection', () => {
  it('injects the email pack for a z.email() field, alongside the general catalog', () => {
    const fx = adversary(z.object({ email: z.email() })).filter((f) => f.field === 'email')
    expect(fx.some((f) => f.family === 'crlf-header-injection')).toBe(true)
    expect(fx.some((f) => f.family === 'homograph-domain')).toBe(true)
    expect(fx.some((f) => f.family === 'sql-injection')).toBe(true) // general catalog still present
  })

  it('injects the uri pack for a z.url() field', () => {
    const fx = adversary(z.object({ link: z.url() })).filter((f) => f.field === 'link')
    expect(fx.some((f) => f.family === 'javascript-scheme')).toBe(true)
    expect(fx.some((f) => f.family === 'cloud-metadata-ssrf')).toBe(true)
  })

  it('injects the uuid pack for a z.uuid() field', () => {
    const fx = adversary(z.object({ id: z.uuid() })).filter((f) => f.field === 'id')
    expect(fx.some((f) => f.family === 'nil-uuid')).toBe(true)
  })

  it('injects the hostname and ipv4 packs', () => {
    const host = adversary(z.object({ host: z.hostname() })).filter((f) => f.field === 'host')
    expect(host.some((f) => f.family === 'numeric-host')).toBe(true)
    const ip = adversary(z.object({ ip: z.ipv4() })).filter((f) => f.field === 'ip')
    expect(ip.some((f) => f.family === 'cloud-metadata')).toBe(true)
  })

  it('injects the ipv6 and base64 packs', () => {
    const v6 = adversary(z.object({ addr: z.ipv6() })).filter((f) => f.field === 'addr')
    expect(v6.some((f) => f.family === 'ipv4-mapped')).toBe(true)
    const blob = adversary(z.object({ blob: z.base64() })).filter((f) => f.field === 'blob')
    expect(blob.some((f) => f.family === 'decodes-to-xss')).toBe(true)
  })

  it('does not inject any pack for a plain string field', () => {
    const fx = adversary(z.object({ name: z.string() }))
    for (const fam of ['crlf-header-injection', 'javascript-scheme', 'nil-uuid']) {
      expect(fx.some((f) => f.family === fam), fam).toBe(false)
    }
  })

  it('pack fixtures carry validity unknown (acceptance is the behaviour under test)', () => {
    const fx = adversary(z.object({ email: z.email() })).filter((f) => f.family === 'homograph-domain')
    expect(fx[0]?.validity).toBe('unknown')
  })
})

// Each hypothesis is checked against Zod's own validator so the framing stays true:
// "z.email()/url()/uuid() accepts/rejects this" is asserted, not assumed.
describe('pack claims match Zod', () => {
  it('email: homograph, oversized local, and plus-address pass; CRLF and address-literal are rejected', () => {
    expect(z.email().safeParse(byFamily('email', 'homograph-domain').value).success).toBe(true)
    expect(z.email().safeParse(byFamily('email', 'oversized-local-part').value).success).toBe(true)
    expect(z.email().safeParse(byFamily('email', 'plus-subaddressing').value).success).toBe(true)
    expect(z.email().safeParse(byFamily('email', 'crlf-header-injection').value).success).toBe(false)
    expect(z.email().safeParse(byFamily('email', 'address-literal-ip').value).success).toBe(false)
    expect(z.email().safeParse(byFamily('email', 'domain-trailing-dot').value).success).toBe(false)
    // the oversized local part is genuinely past the RFC 5321 limit of 64
    expect(byFamily('email', 'oversized-local-part').value.split('@')[0]?.length).toBe(65)
  })

  it('uri: z.url() accepts every dangerous scheme and host in the pack', () => {
    for (const fam of ['javascript-scheme', 'data-scheme', 'file-scheme', 'cloud-metadata-ssrf', 'obfuscated-host', 'userinfo-host-confusion', 'localhost-ssrf', 'ipv6-loopback-ssrf', 'idn-homograph-host', 'backslash-authority']) {
      expect(z.url().safeParse(byFamily('uri', fam).value).success, fam).toBe(true)
    }
  })

  it('uuid: nil/v1/uppercase/max pass (any version), hyphenless/braced are rejected', () => {
    for (const fam of ['nil-uuid', 'non-random-version', 'uuid-uppercase', 'max-uuid']) {
      expect(z.uuid().safeParse(byFamily('uuid', fam).value).success, fam).toBe(true)
    }
    for (const fam of ['uuid-hyphenless', 'uuid-braced']) {
      expect(z.uuid().safeParse(byFamily('uuid', fam).value).success, fam).toBe(false)
    }
    // the non-random-version value really is version 1 (the 13th hex digit)
    expect(byFamily('uuid', 'non-random-version').value[14]).toBe('1')
  })

  it('hostname: every pack entry passes z.hostname()', () => {
    for (const fam of ['loopback-name', 'numeric-host', 'internal-metadata-host', 'homograph-hostname', 'trailing-dot-host', 'uppercase-host']) {
      expect(z.hostname().safeParse(byFamily('hostname', fam).value).success, fam).toBe(true)
    }
  })

  it('ipv4: the valid-but-dangerous addresses pass; the octal-octet form is rejected', () => {
    for (const fam of ['loopback', 'cloud-metadata', 'unspecified-address', 'private-range', 'broadcast']) {
      expect(z.ipv4().safeParse(byFamily('ipv4', fam).value).success, fam).toBe(true)
    }
    expect(z.ipv4().safeParse(byFamily('ipv4', 'octal-octet').value).success).toBe(false)
  })

  it('ipv6: every pack entry passes z.ipv6()', () => {
    for (const fam of ['loopback', 'ipv4-mapped', 'unspecified-address', 'link-local', 'ula-private', 'uncompressed-loopback']) {
      expect(z.ipv6().safeParse(byFamily('ipv6', fam).value).success, fam).toBe(true)
    }
  })

  it('base64: decode payloads pass and decode to their hostile bytes; alt encodings are rejected', () => {
    for (const fam of ['decodes-to-xss', 'decodes-to-sql', 'decodes-to-nul']) {
      expect(z.base64().safeParse(byFamily('base64', fam).value).success, fam).toBe(true)
    }
    for (const fam of ['url-safe-alphabet', 'embedded-newline']) {
      expect(z.base64().safeParse(byFamily('base64', fam).value).success, fam).toBe(false)
    }
    // the decoded content really is the hostile payload the hypothesis names
    expect(Buffer.from(byFamily('base64', 'decodes-to-xss').value, 'base64').toString('utf8')).toBe('<script>alert(1)</script>')
    expect(Buffer.from(byFamily('base64', 'decodes-to-nul').value, 'base64').toString('utf8')).toContain(String.fromCharCode(0))
  })
})

describe('pack integrity', () => {
  it('every entry is well-formed and unique within its pack', () => {
    for (const entries of Object.values(packs)) {
      const values = new Set<string>()
      for (const e of entries) {
        expect(typeof e.value).toBe('string')
        expect(e.value.length).toBeGreaterThan(0)
        expect(e.family).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
        expect(e.failureHypothesis.trim().length).toBeGreaterThan(20)
        expect(values.has(e.value)).toBe(false)
        values.add(e.value)
      }
    }
  })
})
