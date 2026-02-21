import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import { readDice } from '../lib/vision/readDice'

export const visionRouter = router({
  readDice: protectedProcedure
    .input(z.object({
      imageBase64: z.string().min(1),
      mediaType: z.enum(['image/jpeg', 'image/png']).default('image/jpeg'),
    }))
    .mutation(async ({ input }) => {
      const values = await readDice(input.imageBase64, input.mediaType)
      return { values }
    }),
})
