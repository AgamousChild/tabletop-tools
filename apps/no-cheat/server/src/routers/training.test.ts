import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { R2Storage } from '../lib/storage/r2'
import { createCallerFactory } from '../trpc'
import { appRouter } from './index'

const mockStorage: R2Storage = {
  upload: vi.fn().mockResolvedValue('https://cdn.example.com/training/test.png'),
  delete: vi.fn().mockResolvedValue(undefined),
}

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

beforeAll(async () => {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS "user" (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0, image TEXT,
      username TEXT UNIQUE, display_username TEXT UNIQUE,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dice_sets (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES "user"(id),
      name TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES "user"(id),
      dice_set_id TEXT NOT NULL REFERENCES dice_sets(id),
      opponent_name TEXT, z_score REAL, is_loaded INTEGER,
      photo_url TEXT, created_at INTEGER NOT NULL, closed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS rolls (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
      pip_values TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS training_examples (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES "user"(id),
      dice_set_id TEXT NOT NULL REFERENCES dice_sets(id),
      label INTEGER NOT NULL, guess INTEGER, confidence REAL,
      features TEXT NOT NULL, image_url TEXT, is_correct INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS training_frames (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES "user"(id),
      dice_set_id TEXT NOT NULL REFERENCES dice_sets(id),
      image_url TEXT NOT NULL, frame_width INTEGER NOT NULL,
      frame_height INTEGER NOT NULL, boxes_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('user-1', 'Alice', 'alice@example.com', 0, 0, 0);
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
    VALUES ('user-2', 'Bob', 'bob@example.com', 0, 0, 0);
    INSERT INTO dice_sets (id, user_id, name, created_at)
    VALUES ('set-1', 'user-1', 'Red Dragons', 0);
    INSERT INTO dice_sets (id, user_id, name, created_at)
    VALUES ('set-2', 'user-2', 'Blue Dice', 0);
    INSERT INTO dice_sets (id, user_id, name, created_at)
    VALUES ('set-3', 'user-1', 'Empty Set (Alice, no training data)', 0);
  `)
})

afterAll(() => client.close())

const createCaller = createCallerFactory(appRouter)
const req = new Request('http://localhost')
const alice = {
  user: { id: 'user-1', email: 'alice@example.com', name: 'Alice' },
  req,
  db,
  storage: mockStorage,
}
const bob = {
  user: { id: 'user-2', email: 'bob@example.com', name: 'Bob' },
  req,
  db,
  storage: mockStorage,
}
const anon = { user: null, req, db, storage: mockStorage }

// Fake base64 for a tiny grayscale image
const fakeImageBase64 = Buffer.from(new Uint8Array(64 * 64).fill(128)).toString('base64')
// Fake base64 for a full-frame image (small for tests)
const fakeFrameBase64 = Buffer.from(new Uint8Array(100 * 100 * 4).fill(200)).toString('base64')
const fakeFeatures = [
  0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6,
]

describe('training.saveExamples', () => {
  it('saves multiple training examples with images', async () => {
    const caller = createCaller(alice)
    const result = await caller.training.saveExamples({
      diceSetId: 'set-1',
      examples: [
        {
          label: 4,
          guess: 4,
          confidence: 0.9,
          features: fakeFeatures,
          imageBase64: fakeImageBase64,
        },
        {
          label: 2,
          guess: 3,
          confidence: 0.6,
          features: fakeFeatures,
          imageBase64: fakeImageBase64,
        },
      ],
    })
    expect(result.saved).toBe(2)
    expect(mockStorage.upload).toHaveBeenCalled()
  })

  it('marks correct guesses with isCorrect=1', async () => {
    const caller = createCaller(alice)
    const list = await caller.training.list({ diceSetId: 'set-1' })
    const correct = list.examples.find((e) => e.label === 4 && e.guess === 4)
    expect(correct?.isCorrect).toBe(1)
  })

  it('marks incorrect guesses with isCorrect=0', async () => {
    const caller = createCaller(alice)
    const list = await caller.training.list({ diceSetId: 'set-1' })
    const incorrect = list.examples.find((e) => e.label === 2 && e.guess === 3)
    expect(incorrect?.isCorrect).toBe(0)
  })

  it('rejects if dice set belongs to another user', async () => {
    const caller = createCaller(bob)
    await expect(
      caller.training.saveExamples({
        diceSetId: 'set-1',
        examples: [
          {
            label: 1,
            guess: 1,
            confidence: 0.8,
            features: fakeFeatures,
            imageBase64: fakeImageBase64,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(anon)
    await expect(
      caller.training.saveExamples({
        diceSetId: 'set-1',
        examples: [
          {
            label: 1,
            guess: 1,
            confidence: 0.8,
            features: fakeFeatures,
            imageBase64: fakeImageBase64,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('training.list', () => {
  it('returns examples for a dice set owned by the caller', async () => {
    const caller = createCaller(alice)
    const result = await caller.training.list({ diceSetId: 'set-1' })
    expect(result.examples.length).toBeGreaterThanOrEqual(2)
    expect(result.examples[0]?.userId).toBe('user-1')
  })

  it('filters by label', async () => {
    const caller = createCaller(alice)
    const result = await caller.training.list({ diceSetId: 'set-1', label: 4 })
    expect(result.examples.every((e) => e.label === 4)).toBe(true)
  })

  it('is always scoped to the caller, with no myOnly opt-in needed', async () => {
    // Bob saves some training data to his own set
    const bobCaller = createCaller(bob)
    await bobCaller.training.saveExamples({
      diceSetId: 'set-2',
      examples: [
        {
          label: 6,
          guess: 6,
          confidence: 0.99,
          features: fakeFeatures,
          imageBase64: fakeImageBase64,
        },
      ],
    })

    // Bob only ever sees his own, without needing an opt-in flag.
    const result = await bobCaller.training.list({})
    expect(result.examples.every((e) => e.userId === 'user-2')).toBe(true)
  })

  it("rejects listing another user's dice set training data", async () => {
    const caller = createCaller(bob)
    await expect(caller.training.list({ diceSetId: 'set-1' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('returns only the caller-owned examples when no diceSetId filter is given', async () => {
    const caller = createCaller(alice)
    const result = await caller.training.list({})
    expect(result.examples.length).toBeGreaterThanOrEqual(2)
    expect(result.examples.every((e) => e.userId === 'user-1')).toBe(true)
  })

  it('supports pagination with limit and offset', async () => {
    const caller = createCaller(alice)
    const page1 = await caller.training.list({ limit: 1, offset: 0 })
    expect(page1.examples).toHaveLength(1)
    const page2 = await caller.training.list({ limit: 1, offset: 1 })
    expect(page2.examples).toHaveLength(1)
    expect(page1.examples[0]?.id).not.toBe(page2.examples[0]?.id)
  })
})

describe('training.getStats', () => {
  it('returns aggregate stats for a dice set', async () => {
    const caller = createCaller(alice)
    const stats = await caller.training.getStats({ diceSetId: 'set-1' })
    expect(stats.total).toBeGreaterThanOrEqual(2)
    expect(stats.correct).toBeGreaterThanOrEqual(1)
    expect(typeof stats.accuracy).toBe('number')
    expect(stats.perLabel).toBeDefined()
  })

  it('returns zero stats for an owned dice set with no training data', async () => {
    const caller = createCaller(alice)
    const stats = await caller.training.getStats({ diceSetId: 'set-3' })
    expect(stats.total).toBe(0)
    expect(stats.accuracy).toBe(0)
  })

  it("rejects reading another user's dice set stats", async () => {
    const caller = createCaller(bob)
    await expect(caller.training.getStats({ diceSetId: 'set-1' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('rejects reading stats for a nonexistent dice set', async () => {
    const caller = createCaller(alice)
    await expect(caller.training.getStats({ diceSetId: 'nonexistent' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})

describe('training.delete', () => {
  it('deletes own training example', async () => {
    const caller = createCaller(alice)
    const list = await caller.training.list({ diceSetId: 'set-1' })
    const firstId = list.examples[0]!.id
    await caller.training.delete({ id: firstId })
    const after = await caller.training.list({ diceSetId: 'set-1' })
    expect(after.examples.find((e) => e.id === firstId)).toBeUndefined()
  })

  it("rejects deleting another user's example", async () => {
    const aliceCaller = createCaller(alice)
    const aliceList = await aliceCaller.training.list({})
    if (aliceList.examples.length === 0) return // skip if no examples left

    const bobCaller = createCaller(bob)
    await expect(
      bobCaller.training.delete({ id: aliceList.examples[0]!.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('deletes the R2 image when the example has one', async () => {
    const deleteSpy = vi.fn().mockResolvedValue(undefined)
    const storageWithDelete: R2Storage = {
      upload: vi.fn().mockResolvedValue('https://cdn.example.com/training/set-1/example-x.png'),
      delete: deleteSpy,
    }
    const aliceWithSpy = { ...alice, storage: storageWithDelete }
    const caller = createCaller(aliceWithSpy)

    const saved = await caller.training.saveExamples({
      diceSetId: 'set-1',
      examples: [
        {
          label: 5,
          guess: 5,
          confidence: 0.7,
          features: fakeFeatures,
          imageBase64: fakeImageBase64,
        },
      ],
    })
    expect(saved.saved).toBe(1)

    const list = await caller.training.list({ diceSetId: 'set-1' })
    const target = list.examples.find(
      (e) => e.imageUrl === 'https://cdn.example.com/training/set-1/example-x.png',
    )!

    await caller.training.delete({ id: target.id })

    expect(deleteSpy).toHaveBeenCalledTimes(1)
    expect(deleteSpy).toHaveBeenCalledWith(expect.stringContaining('training/set-1/example-x.png'))
  })

  it('surfaces an R2 delete failure instead of silently deleting the row', async () => {
    const storageFailing: R2Storage = {
      upload: vi.fn().mockResolvedValue('https://cdn.example.com/training/set-1/example-y.png'),
      delete: vi.fn().mockRejectedValue(new Error('R2 unavailable')),
    }
    const aliceFailing = { ...alice, storage: storageFailing }
    const caller = createCaller(aliceFailing)

    await caller.training.saveExamples({
      diceSetId: 'set-1',
      examples: [
        {
          label: 5,
          guess: 5,
          confidence: 0.7,
          features: fakeFeatures,
          imageBase64: fakeImageBase64,
        },
      ],
    })
    const list = await caller.training.list({ diceSetId: 'set-1' })
    const target = list.examples.find(
      (e) => e.imageUrl === 'https://cdn.example.com/training/set-1/example-y.png',
    )!

    await expect(caller.training.delete({ id: target.id })).rejects.toThrow()

    const stillThere = await caller.training.list({ diceSetId: 'set-1' })
    expect(stillThere.examples.some((e) => e.id === target.id)).toBe(true)
  })
})

// --- Full-frame training data for YOLO ---

describe('training.saveFrame', () => {
  it('saves a full-frame with bounding boxes', async () => {
    const caller = createCaller(alice)
    const result = await caller.training.saveFrame({
      diceSetId: 'set-1',
      imageBase64: fakeFrameBase64,
      frameWidth: 640,
      frameHeight: 480,
      boxes: [
        { x: 0.2, y: 0.3, w: 0.1, h: 0.1, label: 4 },
        { x: 0.6, y: 0.5, w: 0.12, h: 0.12, label: 2 },
      ],
    })
    expect(result.id).toBeDefined()
    expect(result.imageUrl).toBeDefined()
    expect(mockStorage.upload).toHaveBeenCalled()
  })

  it('rejects if dice set belongs to another user', async () => {
    const caller = createCaller(bob)
    await expect(
      caller.training.saveFrame({
        diceSetId: 'set-1',
        imageBase64: fakeFrameBase64,
        frameWidth: 640,
        frameHeight: 480,
        boxes: [{ x: 0.5, y: 0.5, w: 0.1, h: 0.1, label: 3 }],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects unauthenticated callers', async () => {
    const caller = createCaller(anon)
    await expect(
      caller.training.saveFrame({
        diceSetId: 'set-1',
        imageBase64: fakeFrameBase64,
        frameWidth: 640,
        frameHeight: 480,
        boxes: [{ x: 0.5, y: 0.5, w: 0.1, h: 0.1, label: 1 }],
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('training.listFrames', () => {
  it('returns frames for authenticated user', async () => {
    const caller = createCaller(alice)
    const result = await caller.training.listFrames({ diceSetId: 'set-1' })
    expect(result.frames.length).toBeGreaterThanOrEqual(1)
    expect(result.frames[0]?.boxes).toBeInstanceOf(Array)
    expect(result.frames[0]?.frameWidth).toBe(640)
  })

  it('filters by dice set, returning empty for an owned set with no frames', async () => {
    const caller = createCaller(alice)
    const result = await caller.training.listFrames({ diceSetId: 'set-3' })
    expect(result.frames).toHaveLength(0)
  })

  it('supports pagination', async () => {
    const caller = createCaller(alice)
    const page1 = await caller.training.listFrames({ limit: 1, offset: 0 })
    expect(page1.frames).toHaveLength(1)
  })

  it("rejects listing another user's dice set frames", async () => {
    const caller = createCaller(bob)
    await expect(caller.training.listFrames({ diceSetId: 'set-1' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('rejects listing frames for a nonexistent dice set', async () => {
    const caller = createCaller(alice)
    await expect(caller.training.listFrames({ diceSetId: 'nonexistent' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})

describe('training.exportDataset', () => {
  it('returns YOLO-format dataset', async () => {
    const caller = createCaller(alice)
    const result = await caller.training.exportDataset({ diceSetId: 'set-1' })
    expect(result.totalFrames).toBeGreaterThanOrEqual(1)
    expect(result.classNames).toEqual({ 0: '1', 1: '2', 2: '3', 3: '4', 4: '5', 5: '6' })
    expect(result.dataset[0]?.imageUrl).toBeDefined()
    // Box labels should be 0-indexed (pip 4 → class 3)
    const firstBox = result.dataset[0]?.boxes[0]
    expect(firstBox?.classId).toBe(3) // pip 4 → class 3
  })

  it("rejects exporting another user's dice set dataset", async () => {
    const caller = createCaller(bob)
    await expect(caller.training.exportDataset({ diceSetId: 'set-1' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})

describe('training.deleteFrame', () => {
  it('deletes own frame', async () => {
    const caller = createCaller(alice)
    const list = await caller.training.listFrames({ diceSetId: 'set-1' })
    const frameId = list.frames[0]!.id
    await caller.training.deleteFrame({ id: frameId })
    const after = await caller.training.listFrames({ diceSetId: 'set-1' })
    expect(after.frames.find((f) => f.id === frameId)).toBeUndefined()
  })

  it("rejects deleting another user's frame", async () => {
    // Bob saves a frame to his own set
    const bobCaller = createCaller(bob)
    const saved = await bobCaller.training.saveFrame({
      diceSetId: 'set-2',
      imageBase64: fakeFrameBase64,
      frameWidth: 320,
      frameHeight: 240,
      boxes: [{ x: 0.5, y: 0.5, w: 0.2, h: 0.2, label: 6 }],
    })

    const aliceCaller = createCaller(alice)
    await expect(aliceCaller.training.deleteFrame({ id: saved.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('returns NOT_FOUND for nonexistent frame', async () => {
    const caller = createCaller(alice)
    await expect(caller.training.deleteFrame({ id: 'nonexistent' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('deletes the R2 image when the frame has one', async () => {
    const deleteSpy = vi.fn().mockResolvedValue(undefined)
    const storageWithDelete: R2Storage = {
      upload: vi
        .fn()
        .mockResolvedValue('https://cdn.example.com/training-frames/set-1/frame-x.png'),
      delete: deleteSpy,
    }
    const aliceWithSpy = { ...alice, storage: storageWithDelete }
    const caller = createCaller(aliceWithSpy)

    const saved = await caller.training.saveFrame({
      diceSetId: 'set-1',
      imageBase64: fakeFrameBase64,
      frameWidth: 640,
      frameHeight: 480,
      boxes: [{ x: 0.3, y: 0.3, w: 0.1, h: 0.1, label: 2 }],
    })

    await caller.training.deleteFrame({ id: saved.id })

    expect(deleteSpy).toHaveBeenCalledTimes(1)
    expect(deleteSpy).toHaveBeenCalledWith(
      expect.stringContaining('training-frames/set-1/frame-x.png'),
    )
  })

  it('surfaces an R2 delete failure instead of silently deleting the row', async () => {
    const storageFailing: R2Storage = {
      upload: vi
        .fn()
        .mockResolvedValue('https://cdn.example.com/training-frames/set-1/frame-y.png'),
      delete: vi.fn().mockRejectedValue(new Error('R2 unavailable')),
    }
    const aliceFailing = { ...alice, storage: storageFailing }
    const caller = createCaller(aliceFailing)

    const saved = await caller.training.saveFrame({
      diceSetId: 'set-1',
      imageBase64: fakeFrameBase64,
      frameWidth: 640,
      frameHeight: 480,
      boxes: [{ x: 0.3, y: 0.3, w: 0.1, h: 0.1, label: 2 }],
    })

    await expect(caller.training.deleteFrame({ id: saved.id })).rejects.toThrow()

    const stillThere = await caller.training.listFrames({ diceSetId: 'set-1' })
    expect(stillThere.frames.some((f) => f.id === saved.id)).toBe(true)
  })
})
