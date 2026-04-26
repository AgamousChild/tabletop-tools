import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { commitApprovedNodes } from './commit'
import { saveDraft } from '../drafts/store'
import type { DraftNode } from '../types'

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeDraft(overrides: Partial<DraftNode> = {}): DraftNode {
  return {
    status: 'approved',
    title: 'Fishing for Crits',
    category: 'tactic',
    keywords: ['fishing', 'crits', 'reroll'],
    sourceUrl: 'https://youtu.be/abc123',
    sourceType: 'youtube',
    sourceChannel: 'TacticsChannel',
    confidence: 0.9,
    screenshots: [],
    summary: 'Reroll hits to fish for 6s that trigger crit abilities.',
    content: 'When you have re-rolls, use them offensively to fish for 6s...',
    sourceContext: 'Extracted from tournament video.',
    ...overrides,
  }
}

// ── Test harness ──────────────────────────────────────────────────────────

let ingestDir: string
let brainNodesDir: string

beforeEach(() => {
  ingestDir = mkdtempSync(join(tmpdir(), 'ingest-'))
  brainNodesDir = mkdtempSync(join(tmpdir(), 'brain-nodes-'))
})

afterEach(() => {
  rmSync(ingestDir, { recursive: true, force: true })
  rmSync(brainNodesDir, { recursive: true, force: true })
})

// ── Tests ─────────────────────────────────────────────────────────────────

describe('commitApprovedNodes', () => {
  it('converts approved drafts into brain nodes in community.json', async () => {
    const draftDir = join(ingestDir, 'channel-foo')
    mkdirSync(draftDir, { recursive: true })
    await saveDraft(makeDraft({ title: 'Fishing for Crits' }), draftDir, 0)

    const result = await commitApprovedNodes(ingestDir, brainNodesDir)

    expect(result.committed).toBe(1)

    const communityPath = join(brainNodesDir, 'community.json')
    expect(existsSync(communityPath)).toBe(true)

    const nodes = JSON.parse(readFileSync(communityPath, 'utf-8')) as unknown[]
    expect(nodes).toHaveLength(1)

    const node = nodes[0] as Record<string, unknown>
    expect(node['id']).toBe('community:fishing-for-crits')
    expect(node['layer']).toBe('community')
    expect(node['category']).toBe('tactic')
    expect(node['title']).toBe('Fishing for Crits')
    expect(node['keywords']).toEqual(['fishing', 'crits', 'reroll'])
    expect(node['version']).toBe(1)
    expect(Array.isArray(node['refs'])).toBe(true)
    expect((node['refs'] as unknown[]).length).toBe(0)

    const sources = node['sources'] as Array<Record<string, unknown>>
    expect(sources).toHaveLength(1)
    expect(sources[0]!['type']).toBe('manual')
    expect(sources[0]!['title']).toBe('TacticsChannel')
  })

  it('skips rejected drafts', async () => {
    const draftDir = join(ingestDir, 'channel-foo')
    mkdirSync(draftDir, { recursive: true })
    await saveDraft(makeDraft({ status: 'rejected', title: 'Rejected Tactic' }), draftDir, 0)

    const result = await commitApprovedNodes(ingestDir, brainNodesDir)

    expect(result.committed).toBe(0)
    expect(existsSync(join(brainNodesDir, 'community.json'))).toBe(false)
  })

  it('skips draft-status nodes (not yet reviewed)', async () => {
    const draftDir = join(ingestDir, 'channel-foo')
    mkdirSync(draftDir, { recursive: true })
    await saveDraft(makeDraft({ status: 'draft', title: 'Pending Tactic' }), draftDir, 0)

    const result = await commitApprovedNodes(ingestDir, brainNodesDir)

    expect(result.committed).toBe(0)
    expect(existsSync(join(brainNodesDir, 'community.json'))).toBe(false)
  })

  it('does not re-add duplicate IDs', async () => {
    const existingNode = {
      id: 'community:fishing-for-crits',
      layer: 'community',
      category: 'tactic',
      title: 'Fishing for Crits',
      content: 'Old content',
      summary: 'Old summary',
      sources: [{ type: 'manual', title: 'Old Source', retrievedAt: '2026-01-01T00:00:00.000Z' }],
      refs: [],
      version: 1,
      keywords: ['fishing'],
    }
    writeFileSync(
      join(brainNodesDir, 'community.json'),
      JSON.stringify([existingNode]),
      'utf-8',
    )

    const draftDir = join(ingestDir, 'channel-foo')
    mkdirSync(draftDir, { recursive: true })
    await saveDraft(makeDraft({ title: 'Fishing for Crits' }), draftDir, 0)

    const result = await commitApprovedNodes(ingestDir, brainNodesDir)

    expect(result.committed).toBe(0)

    const nodes = JSON.parse(
      readFileSync(join(brainNodesDir, 'community.json'), 'utf-8'),
    ) as unknown[]
    expect(nodes).toHaveLength(1)
    // Original content preserved, not overwritten
    expect((nodes[0] as Record<string, unknown>)['content']).toBe('Old content')
  })

  it('preserves existing nodes and appends new ones (round-trip)', async () => {
    const existingNode = {
      id: 'community:existing-tactic',
      layer: 'community',
      category: 'tactic',
      title: 'Existing Tactic',
      content: 'Existing content',
      summary: 'Existing summary',
      sources: [{ type: 'manual', title: 'Old', retrievedAt: '2026-01-01T00:00:00.000Z' }],
      refs: [],
      version: 1,
      keywords: ['existing'],
    }
    writeFileSync(
      join(brainNodesDir, 'community.json'),
      JSON.stringify([existingNode]),
      'utf-8',
    )

    const draftDir = join(ingestDir, 'channel-foo')
    mkdirSync(draftDir, { recursive: true })
    await saveDraft(makeDraft({ title: 'New Tactic' }), draftDir, 0)

    const result = await commitApprovedNodes(ingestDir, brainNodesDir)

    expect(result.committed).toBe(1)

    const nodes = JSON.parse(
      readFileSync(join(brainNodesDir, 'community.json'), 'utf-8'),
    ) as unknown[]
    expect(nodes).toHaveLength(2)
    expect((nodes[0] as Record<string, unknown>)['id']).toBe('community:existing-tactic')
    expect((nodes[1] as Record<string, unknown>)['id']).toBe('community:new-tactic')
  })

  it('copies screenshot files to the community directory', async () => {
    const draftDir = join(ingestDir, 'channel-foo')
    mkdirSync(draftDir, { recursive: true })

    // Create a fake screenshot file
    const screenshotPath = join(draftDir, 'frame001.png')
    writeFileSync(screenshotPath, 'fake-png-data')

    const draft = makeDraft({
      title: 'Visual Tactic',
      screenshots: [
        { file: screenshotPath, timestamp: '01:23', timestampSec: 83, caption: 'Key frame' },
      ],
    })
    await saveDraft(draft, draftDir, 0)

    const result = await commitApprovedNodes(ingestDir, brainNodesDir)

    expect(result.committed).toBe(1)
    expect(result.screenshotsUploaded).toBe(1)

    const communityDir = join(brainNodesDir, '..', 'community')
    const copiedFiles = require('node:fs').readdirSync(communityDir)
    expect(copiedFiles).toContain('frame001.png')
  })

  it('sources.title falls back to "Community Content" when sourceChannel is absent', async () => {
    const draftDir = join(ingestDir, 'channel-foo')
    mkdirSync(draftDir, { recursive: true })
    const draft = makeDraft({ title: 'No Channel Tactic' })
    delete (draft as Partial<DraftNode>).sourceChannel
    await saveDraft(draft, draftDir, 0)

    await commitApprovedNodes(ingestDir, brainNodesDir)

    const nodes = JSON.parse(
      readFileSync(join(brainNodesDir, 'community.json'), 'utf-8'),
    ) as unknown[]
    const sources = (nodes[0] as Record<string, unknown>)['sources'] as Array<
      Record<string, unknown>
    >
    expect(sources[0]!['title']).toBe('Community Content')
  })
})
