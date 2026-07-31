import { z } from 'zod'

// Default-exported Zod schema, the common shape the CLI loads.
export default z.object({
  name: z.string().min(2).max(20),
  age: z.number().int().min(0),
  role: z.enum(['admin', 'member', 'guest']),
})
