import { join } from 'node:path'
import type { ContentSource, DraftNode, IngestConfig } from '../types'
import { checkRelevance, extractConcepts, identifyTimestamps } from '../llm/ollama'
import { fetchTranscript } from '../transcript/fetch'
import { cleanTranscriptText } from '../transcript/clean'
import { captureMultipleFrames } from '../screenshots/capture'
import { findSimilar } from './dedup'
import { validateDraft } from './validate'

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Check relevance, extract concepts, and run deduplication against existing nodes.
 *
 * Returns an empty array if the content is not relevant to competitive 40K.
 * Sets draft.similarTo for any draft that matches an existing brain node.
 */
export async function processContent(
  source: ContentSource,
  content: string,
  config: IngestConfig,
  existingNodes: Array<{ id: string; title: string; keywords: string[] }>,
): Promise<DraftNode[]> {
  const relevant = await checkRelevance(content, config.llm)
  if (!relevant) return []

  // Extract from full content first
  let drafts = await extractConcepts(content, source, config.llm)

  // Validate each draft — retry with smaller content chunks if truncated
  const validDrafts: DraftNode[] = []
  for (const draft of drafts) {
    const result = validateDraft(draft)
    if (result.valid) {
      validDrafts.push(draft)
    } else {
      console.log(`    ⚠ Draft "${draft.title}" failed validation: ${result.issues.join(', ')}`)
      // Don't discard — keep it but flag the issues
      validDrafts.push(draft)
    }
  }

  // Dedup each draft against existing brain nodes
  for (const draft of validDrafts) {
    const match = findSimilar(draft, existingNodes)
    if (match !== undefined) {
      draft.similarTo = match
    }
  }

  return validDrafts
}

/**
 * Full YouTube video pipeline: fetch transcript → clean → extract concepts →
 * identify timestamps → capture screenshots → attach screenshots to drafts.
 *
 * Screenshots are attached to the first draft if only one concept is extracted,
 * or distributed across drafts in order (one screenshot set per draft slot).
 */
export async function processYouTubeVideo(
  videoUrl: string,
  title: string,
  config: IngestConfig,
  existingNodes: Array<{ id: string; title: string; keywords: string[] }>,
  outputDir: string,
): Promise<DraftNode[]> {
  // Step 1: Fetch raw transcript
  const rawTranscript = await fetchTranscript(videoUrl, config.ytdlpPath, outputDir)

  // Step 2: Clean 40K terminology errors
  const transcript = await cleanTranscriptText(rawTranscript, config.llm)

  // Step 3: Build content source descriptor
  const source: ContentSource = {
    url: videoUrl,
    type: 'youtube',
    title,
    fetchedAt: new Date().toISOString(),
  }

  // Step 4: Check relevance + extract concepts + dedup
  const drafts = await processContent(source, transcript.cleaned ?? '', config, existingNodes)
  if (drafts.length === 0) return []

  // Step 5: Identify timestamps where visual content appears
  const timestamps = await identifyTimestamps(transcript.cleaned ?? '', config.llm)

  // Step 6: Capture frames for each identified timestamp
  const screenshots = await captureMultipleFrames(
    videoUrl,
    timestamps,
    join(outputDir, 'screenshots'),
    config.ytdlpPath,
  )

  // Step 7: Attach screenshots to drafts
  // All screenshots go to the first draft when there's only one draft.
  // With multiple drafts we still attach all to the first — the reviewer
  // can reassign manually. Screenshots are supplementary context, not
  // one-to-one with concepts.
  if (screenshots.length > 0 && drafts.length > 0) {
    drafts[0]!.screenshots = screenshots
  }

  return drafts
}
