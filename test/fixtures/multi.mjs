import { z } from 'zod'
// Two schema-like exports and no default: the CLI must refuse to guess.
export const Zebra = z.object({ z: z.string() })
export const Alpha = z.object({ a: z.string() })
