#!/usr/bin/env node
import { run } from './cli.js'

// Set exitCode rather than calling process.exit(), which can truncate a large
// piped stdout before it has flushed. Letting the event loop drain then exit is
// the safe way to preserve the full output.
run(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code
  },
  (err: unknown) => {
    process.stderr.write(`adversary: ${(err as Error)?.stack ?? String(err)}\n`)
    process.exitCode = 1
  },
)
