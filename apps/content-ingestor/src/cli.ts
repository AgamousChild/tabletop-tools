#!/usr/bin/env tsx
import { Command } from 'commander'
import { DEFAULT_CONFIG } from './types'
import type { ContentSource } from './types'
import { listChannelVideos } from './crawlers/youtube'
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
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const config = DEFAULT_CONFIG

const program = new Command()
  .name('ingest')
  .description('Ingest competitive 40K content into brain community nodes')
  .version('0.0.1')

// ── channel ────────────────────────────────────────────────────────────────

program
  .command('channel <url>')
  .description('Crawl all videos from a YouTube channel')
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

program.parse()
