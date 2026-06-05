import { z } from 'zod'

/** Shared between the addIngestSource tRPC procedure and the admin client form. */
export const addIngestSourceSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  url: z.string().url('Must be a valid URL'),
  type: z.enum(['youtube', 'web']),
})

export type AddIngestSourceInput = z.infer<typeof addIngestSourceSchema>
