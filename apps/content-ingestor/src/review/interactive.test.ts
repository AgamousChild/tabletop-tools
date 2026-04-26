import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { DraftNode } from '../types'
import { draftToMarkdown } from '../drafts/store'

// ── Module mocks ──────────────────────────────────────────────────────────

// We need the mock functions to be created before the module is imported.
// Use a shared object that the mock factory closes over; we mutate its
// properties inside each test via beforeEach.
const rlMock = {
  question: vi.fn<[string], Promise<string>>(),
  close: vi.fn(),
}

vi.mock('node:readline/promises', () => ({
  createInterface: vi.fn(() => rlMock),
}))

import { reviewDrafts, findDraftDirs } from './interactive'

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeDraft(overrides: Partial<DraftNode> = {}): DraftNode {
  return {
    status: 'draft',
    title: 'Fishing for Crits',
    category: 'tactic',
    keywords: ['fishing', 'reroll', 'sustained hits'],
    sourceUrl: 'https://youtube.com/watch?v=abc123',
    sourceType: 'youtube',
    sourceChannel: 'BestChannel40K',
    confidence: 0.87,
    screenshots: [],
    summary: 'Reroll to fish for 6s that trigger sustained hits.',
    content: 'Position your unit to maximise crit triggers...',
    sourceContext: 'From a competitive 40K tactics video.',
    ...overrides,
  }
}

/** Write a draft .md file into a temp subdirectory and return the dir path. */
function writeDraftDir(baseDir: string, draft: DraftNode, subdir = 'draft-001'): string {
  const dir = join(baseDir, subdir)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'node-001-test.md'), draftToMarkdown(draft))
  return dir
}

// ── findDraftDirs ─────────────────────────────────────────────────────────

describe('findDraftDirs', () => {
  it('returns directories that contain .md files', async () => {
    const base = mkdtempSync(join(tmpdir(), 'review-test-'))
    try {
      const dir = writeDraftDir(base, makeDraft())
      const dirs = await findDraftDirs(base)
      expect(dirs).toContain(dir)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('excludes directories with no .md files', async () => {
    const base = mkdtempSync(join(tmpdir(), 'review-test-'))
    try {
      const emptyDir = join(base, 'empty')
      mkdirSync(emptyDir)
      // No .md files
      const dirs = await findDraftDirs(base)
      expect(dirs).not.toContain(emptyDir)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('returns empty array when base directory has no subdirectories', async () => {
    const base = mkdtempSync(join(tmpdir(), 'review-test-'))
    try {
      const dirs = await findDraftDirs(base)
      expect(dirs).toEqual([])
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })
})

// ── reviewDrafts ──────────────────────────────────────────────────────────

describe('reviewDrafts', () => {
  beforeEach(() => {
    rlMock.question.mockReset()
    rlMock.close.mockReset()
  })

  it('prints "No drafts to review." and returns zeroes when no draft dirs exist', async () => {
    const base = mkdtempSync(join(tmpdir(), 'review-test-'))
    try {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const result = await reviewDrafts(base)

      expect(result).toEqual({ approved: 0, rejected: 0, skipped: 0 })
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No drafts to review'))

      consoleSpy.mockRestore()
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('returns zeroes when all drafts have non-draft status', async () => {
    const base = mkdtempSync(join(tmpdir(), 'review-test-'))
    try {
      writeDraftDir(base, makeDraft({ status: 'approved' }))
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const result = await reviewDrafts(base)

      expect(result).toEqual({ approved: 0, rejected: 0, skipped: 0 })
      consoleSpy.mockRestore()
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('approves a draft and increments the approved count', async () => {
    const base = mkdtempSync(join(tmpdir(), 'review-test-'))
    try {
      writeDraftDir(base, makeDraft())
      rlMock.question.mockResolvedValueOnce('a')
      vi.spyOn(console, 'log').mockImplementation(() => {})

      const result = await reviewDrafts(base)

      expect(result.approved).toBe(1)
      expect(result.rejected).toBe(0)
      expect(result.skipped).toBe(0)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('rejects a draft and increments the rejected count', async () => {
    const base = mkdtempSync(join(tmpdir(), 'review-test-'))
    try {
      writeDraftDir(base, makeDraft())
      rlMock.question.mockResolvedValueOnce('r')
      vi.spyOn(console, 'log').mockImplementation(() => {})

      const result = await reviewDrafts(base)

      expect(result.rejected).toBe(1)
      expect(result.approved).toBe(0)
      expect(result.skipped).toBe(0)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('skips a draft and increments the skipped count', async () => {
    const base = mkdtempSync(join(tmpdir(), 'review-test-'))
    try {
      writeDraftDir(base, makeDraft())
      rlMock.question.mockResolvedValueOnce('s')
      vi.spyOn(console, 'log').mockImplementation(() => {})

      const result = await reviewDrafts(base)

      expect(result.skipped).toBe(1)
      expect(result.approved).toBe(0)
      expect(result.rejected).toBe(0)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('quits early when "q" is entered and returns current counts', async () => {
    const base = mkdtempSync(join(tmpdir(), 'review-test-'))
    try {
      writeDraftDir(base, makeDraft(), 'draft-001')
      writeDraftDir(base, makeDraft({ title: 'Attack Volume' }), 'draft-002')
      // Approve first, then quit before reaching second
      rlMock.question.mockResolvedValueOnce('a').mockResolvedValueOnce('q')
      vi.spyOn(console, 'log').mockImplementation(() => {})

      const result = await reviewDrafts(base)

      expect(result.approved).toBe(1)
      // Second draft never processed
      expect(result.skipped).toBe(0)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('re-prompts on invalid input and then processes the valid answer', async () => {
    const base = mkdtempSync(join(tmpdir(), 'review-test-'))
    try {
      writeDraftDir(base, makeDraft())
      // Invalid input first, then approve
      rlMock.question.mockResolvedValueOnce('x').mockResolvedValueOnce('a')
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const result = await reviewDrafts(base)

      expect(result.approved).toBe(1)
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid choice'))
      consoleSpy.mockRestore()
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })

  it('prints similarity warning when draft has similarTo field', async () => {
    const base = mkdtempSync(join(tmpdir(), 'review-test-'))
    try {
      writeDraftDir(base, makeDraft({ similarTo: 'community:fishing-for-crits' }))
      rlMock.question.mockResolvedValueOnce('s')
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await reviewDrafts(base)

      const allOutput = consoleSpy.mock.calls.flat().join('\n')
      expect(allOutput).toContain('community:fishing-for-crits')
      consoleSpy.mockRestore()
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })
})
