import type { Transcript, LLMConfig } from '../types'
import { cleanTranscript } from '../llm/ollama'

/**
 * Join all transcript segments into a single string, send to the LLM for
 * 40K terminology cleanup, and return the transcript with the cleaned field set.
 */
export async function cleanTranscriptText(
  transcript: Transcript,
  config: LLMConfig,
): Promise<Transcript> {
  const raw = transcript.original.map((seg) => seg.text).join(' ')
  const cleaned = await cleanTranscript(raw, config)
  return { ...transcript, cleaned }
}
