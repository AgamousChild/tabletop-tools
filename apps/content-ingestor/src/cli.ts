#!/usr/bin/env tsx
import { Command } from 'commander'
import { DEFAULT_CONFIG } from './types'
import type { ContentSource } from './types'
import { listChannelVideos } from './crawlers/youtube'
import { fetchTranscript } from './transcript/fetch'
import { crawlSite, fetchArticle } from './crawlers/web'
import { crawlSubreddit, fetchRedditPost } from './crawlers/reddit'
import { processContent, processYouTubeVideo } from './extract/extract'
import { loadExistingNodes } from './extract/dedup'
import { saveDraft, loadDrafts } from './drafts/store'
import {
  loadManifest,
  saveManifest,
  getUnprocessedEntries,
  markEntryProcessed,
} from './drafts/manifest'
import { reviewDrafts, findDraftDirs } from './review/interactive'
import { commitApprovedNodes } from './commit/commit'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { validateDraft } from './extract/validate'
import { loadTermDictionary, buildPhoneticIndex, scanDraftsForMismatches, applyPhoneticFixes, findPhoneticMatches } from './extract/phonetic-fix'
import { autoReviewDrafts, REVIEWER_CONFIG } from './review/auto-review'

const config = DEFAULT_CONFIG

const program = new Command()
  .name('ingest')
  .description('Ingest competitive 40K content into brain community nodes')
  .version('0.0.1')

// ── fetch (pass 1: transcripts only, no LLM) ─────────────────────────────

program
  .command('fetch <url>')
  .description('Fetch all video transcripts from a YouTube channel (no LLM processing)')
  .action(async (url: string) => {
    console.log(`Fetching transcripts from: ${url}`)
    const videos = await listChannelVideos(url, config.ytdlpPath)
    console.log(`Found ${videos.length} videos`)

    const slug = url.replace(/.*@/, '').replace(/[^a-z0-9]/gi, '-').toLowerCase()
    const outDir = path.join(config.dataDir, slug)
    const transcriptDir = path.join(outDir, 'transcripts')
    mkdirSync(transcriptDir, { recursive: true })

    let manifest = await loadManifest(outDir)
    if (!manifest) {
      manifest = {
        source: url,
        sourceType: 'youtube',
        lastCrawlAt: new Date().toISOString(),
        entries: [],
      }
    }

    for (const v of videos) {
      if (!manifest.entries.find(e => e.url === v.url)) {
        manifest.entries.push({ url: v.url, title: v.title })
      }
    }

    const unprocessed = getUnprocessedEntries(manifest)
    console.log(`${unprocessed.length} videos to fetch`)

    let fetched = 0
    let failed = 0
    for (const entry of unprocessed) {
      try {
        process.stdout.write(`  [${fetched + failed + 1}/${unprocessed.length}] ${entry.title.substring(0, 60)}...`)
        await fetchTranscript(entry.url, config.ytdlpPath, transcriptDir)
        markEntryProcessed(manifest, entry.url, true, 0)
        fetched++
        console.log(' ✓')
      } catch {
        markEntryProcessed(manifest, entry.url, false, 0)
        failed++
        console.log(' ✗ (no transcript)')
      }
    }

    manifest.lastCrawlAt = new Date().toISOString()
    await saveManifest(manifest, outDir)
    console.log(`\nDone. ${fetched} transcripts fetched, ${failed} failed. Saved to ${transcriptDir}`)
  })

// ── process (pass 2: LLM extraction on saved transcripts) ─────────────────

program
  .command('process <channelSlug>')
  .description('Run LLM extraction on previously fetched transcripts')
  .action(async (channelSlug: string) => {
    const outDir = path.join(config.dataDir, channelSlug)
    const transcriptDir = path.join(outDir, 'transcripts')

    // Find all json3 transcript files
    let transcriptFiles: string[]
    try {
      transcriptFiles = readdirSync(transcriptDir).filter(f => f.endsWith('.json3'))
    } catch {
      console.error(`No transcripts found in ${transcriptDir}. Run 'ingest fetch' first.`)
      return
    }

    console.log(`Found ${transcriptFiles.length} transcripts in ${transcriptDir}`)

    const existingNodes = await loadExistingNodes(config.brainNodesDir)
    let totalNodes = 0
    let validated = 0
    let withIssues = 0

    for (let i = 0; i < transcriptFiles.length; i++) {
      const file = transcriptFiles[i]!
      const filePath = path.join(transcriptDir, file)

      try {
        // Parse json3 transcript
        const raw = readFileSync(filePath, 'utf-8')
        const data = JSON.parse(raw) as { events: Array<{ segs?: Array<{ utf8?: string }>; tStartMs?: number }> }
        const text = data.events
          .filter(e => e.segs && e.segs.length > 0)
          .map(e => (e.segs ?? []).map(s => s.utf8 ?? '').join('').trim())
          .filter(t => t.length > 0)
          .join(' ')

        if (text.length < 50) {
          console.log(`  [${i + 1}/${transcriptFiles.length}] ${file} — too short, skipping`)
          continue
        }

        process.stdout.write(`  [${i + 1}/${transcriptFiles.length}] ${file.replace('.en.json3', '')}...`)

        // Extract video ID from filename for URL
        const videoId = file.replace('.en.json3', '')
        const source = {
          url: `https://www.youtube.com/watch?v=${videoId}`,
          type: 'youtube' as const,
          channel: channelSlug,
          title: videoId,
          fetchedAt: new Date().toISOString(),
        }

        const drafts = await processContent(source, text, config, existingNodes)

        // Validate each draft
        let draftIssues = 0
        for (const draft of drafts) {
          const result = validateDraft(draft)
          if (!result.valid) draftIssues++
        }

        for (let j = 0; j < drafts.length; j++) {
          await saveDraft(drafts[j]!, outDir, totalNodes + j)
        }

        totalNodes += drafts.length
        validated += drafts.length - draftIssues
        withIssues += draftIssues

        if (drafts.length === 0) {
          console.log(' — not relevant')
        } else if (draftIssues > 0) {
          console.log(` → ${drafts.length} concepts (${draftIssues} with issues)`)
        } else {
          console.log(` → ${drafts.length} concepts ✓`)
        }
      } catch (err) {
        console.log(` ✗ Error: ${err instanceof Error ? err.message : err}`)
      }
    }

    console.log(`\nDone. ${totalNodes} drafts (${validated} clean, ${withIssues} with issues). Saved to ${outDir}`)
  })

// ── channel ────────────────────────────────────────────────────────────────

program
  .command('channel <url>')
  .description('Crawl all videos from a YouTube channel (full LLM processing)')
  .action(async (url: string) => {
    console.log(`Crawling channel: ${url}`)
    const videos = await listChannelVideos(url, config.ytdlpPath)
    console.log(`Found ${videos.length} videos`)

    const slug = url.replace(/.*@/, '').replace(/[^a-z0-9]/gi, '-').toLowerCase()
    const outDir = path.join(config.dataDir, slug)
    mkdirSync(outDir, { recursive: true })

    let manifest = await loadManifest(outDir)
    if (!manifest) {
      manifest = {
        source: url,
        sourceType: 'youtube',
        lastCrawlAt: new Date().toISOString(),
        entries: [],
      }
    }

    for (const v of videos) {
      if (!manifest.entries.find((e) => e.url === v.url)) {
        manifest.entries.push({ url: v.url, title: v.title })
      }
    }

    const unprocessed = getUnprocessedEntries(manifest)
    console.log(`${unprocessed.length} unprocessed videos`)

    const existingNodes = await loadExistingNodes(config.brainNodesDir)
    let totalNodes = 0

    for (const entry of unprocessed) {
      console.log(`\nProcessing: ${entry.title}`)
      try {
        const drafts = await processYouTubeVideo(
          entry.url,
          entry.title,
          config,
          existingNodes,
          path.join(outDir, 'videos'),
        )

        for (let i = 0; i < drafts.length; i++) {
          await saveDraft(drafts[i]!, outDir, totalNodes + i)
        }

        markEntryProcessed(manifest, entry.url, drafts.length > 0, drafts.length)
        totalNodes += drafts.length
        console.log(`  → ${drafts.length} tactical concepts extracted`)
      } catch (err) {
        console.error(`  ✗ Error: ${err instanceof Error ? err.message : err}`)
        markEntryProcessed(manifest, entry.url, false, 0)
      }
    }

    manifest.lastCrawlAt = new Date().toISOString()
    await saveManifest(manifest, outDir)
    console.log(`\nDone. ${totalNodes} total drafts generated in ${outDir}`)
  })

// ── site ───────────────────────────────────────────────────────────────────

program
  .command('site <url>')
  .description('Crawl all articles from a website')
  .action(async (url: string) => {
    const isReddit = url.includes('reddit.com')
    console.log(`Crawling ${isReddit ? 'subreddit' : 'site'}: ${url}`)

    const slug = new URL(url).hostname.replace(/[^a-z0-9]/gi, '-').toLowerCase()
    const outDir = path.join(config.dataDir, slug)
    mkdirSync(outDir, { recursive: true })

    let manifest = await loadManifest(outDir)
    if (!manifest) {
      manifest = {
        source: url,
        sourceType: isReddit ? 'reddit' : 'article',
        lastCrawlAt: new Date().toISOString(),
        entries: [],
      }
    }

    const articles = isReddit
      ? (await crawlSubreddit(url)).map((p) => ({ url: p.url, title: p.title }))
      : await crawlSite(url)

    console.log(`Found ${articles.length} articles`)

    for (const a of articles) {
      if (!manifest.entries.find((e) => e.url === a.url)) {
        manifest.entries.push({ url: a.url, title: a.title })
      }
    }

    const unprocessed = getUnprocessedEntries(manifest)
    console.log(`${unprocessed.length} unprocessed articles`)

    const existingNodes = await loadExistingNodes(config.brainNodesDir)
    let totalNodes = 0

    for (const entry of unprocessed) {
      console.log(`\nProcessing: ${entry.title}`)
      try {
        const article = isReddit
          ? await fetchRedditPost(entry.url)
          : await fetchArticle(entry.url)

        const content = isReddit
          ? `${article.title}\n\n${article.content}\n\n${(article as { comments?: string[] }).comments?.join('\n\n') ?? ''}`
          : article.content

        const source: ContentSource = {
          url: entry.url,
          type: isReddit ? 'reddit' : 'article',
          site: new URL(url).hostname,
          title: article.title,
          fetchedAt: new Date().toISOString(),
        }

        const drafts = await processContent(source, content, config, existingNodes)

        for (let i = 0; i < drafts.length; i++) {
          await saveDraft(drafts[i]!, outDir, totalNodes + i)
        }

        markEntryProcessed(manifest, entry.url, drafts.length > 0, drafts.length)
        totalNodes += drafts.length
        console.log(`  → ${drafts.length} tactical concepts extracted`)
      } catch (err) {
        console.error(`  ✗ Error: ${err instanceof Error ? err.message : err}`)
        markEntryProcessed(manifest, entry.url, false, 0)
      }
    }

    manifest.lastCrawlAt = new Date().toISOString()
    await saveManifest(manifest, outDir)
    console.log(`\nDone. ${totalNodes} total drafts generated in ${outDir}`)
  })

// ── url ────────────────────────────────────────────────────────────────────

program
  .command('url <url>')
  .description('Process a single URL (video, article, or Reddit post)')
  .action(async (url: string) => {
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be')
    const isReddit = url.includes('reddit.com')

    const slug = isYouTube ? 'single-video' : 'single-article'
    const outDir = path.join(config.dataDir, slug)
    mkdirSync(outDir, { recursive: true })

    const existingNodes = await loadExistingNodes(config.brainNodesDir)

    let drafts
    if (isYouTube) {
      drafts = await processYouTubeVideo(url, 'Single video', config, existingNodes, outDir)
    } else {
      const article = isReddit ? await fetchRedditPost(url) : await fetchArticle(url)
      const content = isReddit
        ? `${article.title}\n\n${article.content}\n\n${(article as { comments?: string[] }).comments?.join('\n\n') ?? ''}`
        : article.content
      const source: ContentSource = {
        url,
        type: isReddit ? 'reddit' : 'article',
        title: article.title,
        fetchedAt: new Date().toISOString(),
      }
      drafts = await processContent(source, content, config, existingNodes)
    }

    for (let i = 0; i < drafts.length; i++) {
      await saveDraft(drafts[i]!, outDir, i)
    }

    console.log(`${drafts.length} drafts generated in ${outDir}`)
  })

// ── review ─────────────────────────────────────────────────────────────────

program
  .command('review')
  .description('Interactively review draft nodes')
  .action(async () => {
    const { approved, rejected, skipped } = await reviewDrafts(config.dataDir)
    console.log(`\nFinal: ${approved} approved, ${rejected} rejected, ${skipped} skipped`)
  })

// ── commit ─────────────────────────────────────────────────────────────────

program
  .command('commit')
  .description('Commit approved nodes to brain graph')
  .action(async () => {
    const result = await commitApprovedNodes(config.dataDir, config.brainNodesDir)
    console.log(`Committed ${result.committed} nodes, ${result.screenshotsUploaded} screenshots`)
  })

// ── list ───────────────────────────────────────────────────────────────────

program
  .command('list')
  .description('List all pending drafts')
  .action(async () => {
    const dirs = await findDraftDirs(config.dataDir)
    let total = 0
    for (const dir of dirs) {
      const drafts = await loadDrafts(dir)
      for (const { draft } of drafts) {
        const statusIcon =
          draft.status === 'approved' ? '✓' : draft.status === 'rejected' ? '✗' : '?'
        console.log(
          `  ${statusIcon} [${draft.status}] ${draft.title} (${draft.sourceType}: ${draft.sourceChannel ?? draft.sourceUrl})`,
        )
        total++
      }
    }
    if (total === 0) console.log('No drafts found.')
    else console.log(`\n${total} total drafts`)
  })

// ── auto-review (AI-powered review using different model) ─────────────────

program
  .command('auto-review <channelSlug>')
  .description('Auto-review drafts using Gemma 2 (different model from extractor)')
  .action(async (channelSlug: string) => {
    const draftDir = path.join(config.dataDir, channelSlug)
    const result = await autoReviewDrafts(draftDir, REVIEWER_CONFIG)
    console.log(`\nFinal: ${result.approved} approved, ${result.rejected} rejected, ${result.needsFix} need fixes`)
  })

// ── fix (phonetic correction scan) ────────────────────────────────────────

program
  .command('fix [channelSlug]')
  .description('Scan drafts for phonetically mismatched 40K terms and fix them')
  .option('--dry-run', 'Show matches without applying fixes')
  .option('--min-confidence <n>', 'Minimum confidence threshold (0-1)', '0.7')
  .action(async (channelSlug: string | undefined, opts: { dryRun?: boolean; minConfidence?: string }) => {
    const draftDir = channelSlug
      ? path.join(config.dataDir, channelSlug)
      : config.dataDir

    const minConf = parseFloat(opts.minConfidence ?? '0.7')

    console.log(`Loading 40K term dictionary from brain...`)
    const terms = loadTermDictionary(config.brainNodesDir)
    console.log(`${terms.length} known terms loaded`)

    const index = buildPhoneticIndex(terms)
    console.log(`Phonetic index built\n`)

    // Find all draft directories
    const dirs = channelSlug ? [draftDir] : await findDraftDirs(draftDir)
    let totalMatches = 0
    let totalFixed = 0

    for (const dir of dirs) {
      const files = readdirSync(dir).filter(f => f.endsWith('.md'))
      if (files.length === 0) continue

      console.log(`Scanning ${path.basename(dir)}/  (${files.length} files)`)

      for (const file of files) {
        const filePath = path.join(dir, file)
        const content = readFileSync(filePath, 'utf-8')
        const matches = findPhoneticMatches(content, terms, index)

        const highConf = matches.filter(m => m.confidence >= minConf)
        if (highConf.length === 0) continue

        totalMatches += highConf.length

        for (const m of highConf) {
          console.log(`  ${file}: "${m.original}" → "${m.replacement}" (${(m.confidence * 100).toFixed(0)}%)`)
        }

        if (!opts.dryRun) {
          const fixed = applyPhoneticFixes(content, matches, minConf)
          writeFileSync(filePath, fixed)
          totalFixed += highConf.length
        }
      }
    }

    if (opts.dryRun) {
      console.log(`\n${totalMatches} potential fixes found (dry run — nothing changed)`)
    } else {
      console.log(`\n${totalFixed} fixes applied`)
    }
  })

program.parse()
