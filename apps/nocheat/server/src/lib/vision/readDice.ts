import Anthropic from '@anthropic-ai/sdk'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const client = new Anthropic()

/**
 * Given a base64-encoded image, returns the face values of all dice visible.
 * e.g. [3, 5, 2] for three dice showing 3, 5, and 2.
 */
export async function readDice(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' = 'image/jpeg',
): Promise<number[]> {
  // Save image for debugging
  try {
    const debugDir = join(process.cwd(), 'debug-images')
    mkdirSync(debugDir, { recursive: true })
    const filename = join(debugDir, `dice-${Date.now()}.jpg`)
    writeFileSync(filename, Buffer.from(imageBase64, 'base64'))
    console.log('[vision] saved image:', filename)
  } catch (e) {
    console.log('[vision] could not save image:', e)
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    thinking: { type: 'enabled', budget_tokens: 5000 },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageBase64 },
          },
          {
            type: 'text',
            text: `You are reading dice values from a photo. The dice are white cubic d6s. The background may be a decorated game board with textures, artwork, or oval/circular patterns — IGNORE all background patterns, they are not dice pips.

STEP 1 — Find all dice: Identify every white cubic die. They are small white squares/cubes with black dots. Do not confuse background artwork with dice.

STEP 2 — For each die, read the TOP face only. The top face is the largest, most square-looking white surface on the die. Side faces appear narrower or trapezoidal due to perspective — ignore them entirely.

STEP 3 — Count the black circular pips on the top face. Standard d6 pip layouts:
• 1: one dot in the center
• 2: two dots, top-right and bottom-left
• 3: three dots diagonal (top-right, center, bottom-left)
• 4: four dots in corners
• 5: four corner dots + one center dot
• 6: six dots in two columns of three (no center dot)

Key distinction: 3 has a CENTER dot with two corner dots. 6 has NO center dot but has six total dots in two columns. Do not confuse them.

STEP 4 — Return ONLY a JSON array of integers, one per die, in reading order (top-left to bottom-right). Example: [4,2,6,1,3,5]. No explanation, no text, just the array.`,
          },
        ],
      },
    ],
  })

  const text = response.content.find((b) => b.type === 'text')?.text.trim() ?? '[]'
  console.log('[vision] raw response:', text)

  try {
    const match = text.match(/\[[\d,\s]*\]/)
    const values = JSON.parse(match ? match[0] : text)
    if (!Array.isArray(values)) return []
    return values.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 6)
  } catch {
    console.log('[vision] parse failed for:', text)
    return []
  }
}
