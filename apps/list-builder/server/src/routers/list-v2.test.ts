import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { createCallerFactory } from '@tabletop-tools/server-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { appRouter } from './index'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

beforeAll(async () => {
  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, email_verified INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE dim_dataslate (id TEXT PRIMARY KEY, name TEXT NOT NULL, effective_date INTEGER NOT NULL, end_date INTEGER);
    CREATE TABLE content_entity (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, faction_id TEXT, parent_id TEXT, dataslate_id TEXT, r2_key TEXT, wahapedia_id TEXT, bsdata_id TEXT, updated_at INTEGER NOT NULL);
    CREATE TABLE list (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT, author TEXT, edition TEXT NOT NULL DEFAULT '11th', faction_id TEXT REFERENCES content_entity(id), subfaction_id TEXT REFERENCES content_entity(id), detachment_id TEXT REFERENCES content_entity(id), battle_size TEXT NOT NULL DEFAULT 'unknown', total_points INTEGER NOT NULL DEFAULT 0, dataslate_id TEXT REFERENCES dim_dataslate(id), source TEXT NOT NULL DEFAULT 'list-builder', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE list_unit (id TEXT PRIMARY KEY, list_id TEXT NOT NULL REFERENCES list(id) ON DELETE CASCADE, datasheet_id TEXT REFERENCES content_entity(id), enhancement_id TEXT REFERENCES content_entity(id), is_warlord INTEGER NOT NULL DEFAULT 0, points INTEGER NOT NULL DEFAULT 0, attached_to_unit_id TEXT REFERENCES list_unit(id), attach_role TEXT);
    CREATE TABLE list_unit_loadout (id TEXT PRIMARY KEY, list_unit_id TEXT NOT NULL REFERENCES list_unit(id) ON DELETE CASCADE, model_count INTEGER NOT NULL);
    CREATE TABLE list_unit_loadout_weapon (id TEXT PRIMARY KEY, loadout_id TEXT NOT NULL REFERENCES list_unit_loadout(id) ON DELETE CASCADE, weapon_id TEXT REFERENCES content_entity(id), count INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE content_can_lead (leader_datasheet_id TEXT NOT NULL REFERENCES content_entity(id) ON DELETE CASCADE, bodyguard_datasheet_id TEXT NOT NULL REFERENCES content_entity(id) ON DELETE CASCADE, PRIMARY KEY (leader_datasheet_id, bodyguard_datasheet_id));
    INSERT INTO "user" VALUES ('u-1', 'Alice', 'a@test.com', 0, 0, 0);
    INSERT INTO "user" VALUES ('u-2', 'Bob', 'b@test.com', 0, 0, 0);
    INSERT INTO content_entity VALUES ('w-sword', 'weapon', 'Power Sword', NULL, NULL, NULL, NULL, NULL, NULL, 0);
    INSERT INTO content_entity VALUES ('ds-captain', 'datasheet', 'Captain', NULL, NULL, NULL, NULL, NULL, NULL, 0);
    INSERT INTO content_entity VALUES ('ds-intercessors', 'datasheet', 'Intercessors', NULL, NULL, NULL, NULL, NULL, NULL, 0);
    INSERT INTO content_entity VALUES ('ds-terminators', 'datasheet', 'Terminators', NULL, NULL, NULL, NULL, NULL, NULL, 0);
    INSERT INTO content_can_lead VALUES ('ds-captain', 'ds-intercessors');
  `)
})

afterAll(() => client.close())

const createCaller = createCallerFactory(appRouter)
const req = new Request('http://localhost')
const ctx = { user: { id: 'u-1', email: 'a@test.com', name: 'Alice' }, req, db }
const ctx2 = { user: { id: 'u-2', email: 'b@test.com', name: 'Bob' }, req, db }
const unauthCtx = { user: null, req, db }

describe('listV2.create', () => {
  it('creates a new list and returns id', async () => {
    const caller = createCaller(ctx)
    const result = await caller.listV2.create({
      name: 'My GT List',
      edition: '11th',
      battleSize: 'Strike Force',
    })
    expect(result.id).toBeDefined()
    expect(typeof result.id).toBe('string')
  })

  it('rejects unauthenticated', async () => {
    const caller = createCaller(unauthCtx)
    await expect(
      caller.listV2.create({ name: 'x', edition: '11th', battleSize: 'unknown' }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
  })

  it('persists description on create and surfaces it on get', async () => {
    const caller = createCaller(ctx)
    const { id } = await caller.listV2.create({
      name: 'Described list',
      description: 'My narrative campaign army',
      edition: '11th',
      battleSize: 'Strike Force',
    })
    const fetched = await caller.listV2.get({ id })
    expect(fetched.description).toBe('My narrative campaign army')
  })

  it('updates description; nullable round-trips', async () => {
    const caller = createCaller(ctx)
    const { id } = await caller.listV2.create({
      name: 'Updatable',
      edition: '11th',
      battleSize: 'unknown',
    })
    await caller.listV2.update({ id, description: 'first draft' })
    let fetched = await caller.listV2.get({ id })
    expect(fetched.description).toBe('first draft')
    await caller.listV2.update({ id, description: null })
    fetched = await caller.listV2.get({ id })
    expect(fetched.description).toBeNull()
  })
})

describe('listV2.getAll', () => {
  it('returns only lists for the authenticated user', async () => {
    const caller1 = createCaller(ctx)
    const caller2 = createCaller(ctx2)
    // Create a list for user-2
    await caller2.listV2.create({ name: 'Bob list', edition: '11th', battleSize: 'unknown' })
    const user1Lists = await caller1.listV2.getAll()
    const user2Lists = await caller2.listV2.getAll()
    expect(user1Lists.every((l) => l.userId === 'u-1')).toBe(true)
    expect(user2Lists.every((l) => l.userId === 'u-2')).toBe(true)
  })
})

describe('listV2.addUnit', () => {
  it('adds a unit to a list', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({
      name: 'Unit test list',
      edition: '11th',
      battleSize: 'unknown',
    })
    const { id: unitId } = await caller.listV2.addUnit({
      listId,
      points: 90,
      isWarlord: false,
    })
    expect(unitId).toBeDefined()
    const fetched = await caller.listV2.get({ id: listId })
    expect(fetched.units).toHaveLength(1)
    expect(fetched.units[0]!.points).toBe(90)
  })

  it('rejects adding a unit to another user list', async () => {
    const caller1 = createCaller(ctx)
    const caller2 = createCaller(ctx2)
    const { id: listId } = await caller1.listV2.create({
      name: 'Private',
      edition: '11th',
      battleSize: 'unknown',
    })
    await expect(
      caller2.listV2.addUnit({ listId, points: 0, isWarlord: false }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})

describe('listV2.setLoadout', () => {
  it('replaces loadouts and weapons for a unit', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({
      name: 'Loadout test',
      edition: '11th',
      battleSize: 'unknown',
    })
    const { id: unitId } = await caller.listV2.addUnit({ listId, points: 90, isWarlord: false })
    await caller.listV2.setLoadout({
      unitId,
      loadouts: [
        { modelCount: 4, weapons: [] },
        { modelCount: 1, weapons: [{ weaponId: 'w-sword', count: 1 }] },
      ],
    })
    const fetched = await caller.listV2.get({ id: listId })
    expect(fetched.units[0]!.loadouts).toHaveLength(2)
    expect(fetched.units[0]!.loadouts[1]!.weapons).toHaveLength(1)
  })
})

describe('listV2.removeUnit', () => {
  it('removes a unit from a list', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({
      name: 'Remove test',
      edition: '11th',
      battleSize: 'unknown',
    })
    const { id: unitId } = await caller.listV2.addUnit({ listId, points: 90, isWarlord: false })
    await caller.listV2.removeUnit({ id: unitId })
    const fetched = await caller.listV2.get({ id: listId })
    expect(fetched.units).toHaveLength(0)
  })
})

describe('listV2.delete', () => {
  it('deletes a list and cascades to units', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({
      name: 'Delete me',
      edition: '11th',
      battleSize: 'unknown',
    })
    await caller.listV2.addUnit({ listId, points: 0, isWarlord: false })
    await caller.listV2.delete({ id: listId })
    const all = await caller.listV2.getAll()
    expect(all.find((l) => l.id === listId)).toBeUndefined()
  })

  it('does not delete another user list', async () => {
    const caller1 = createCaller(ctx)
    const caller2 = createCaller(ctx2)
    const { id } = await caller1.listV2.create({
      name: 'Protected',
      edition: '11th',
      battleSize: 'unknown',
    })
    await caller2.listV2.delete({ id })
    const user1Lists = await caller1.listV2.getAll()
    expect(user1Lists.find((l) => l.id === id)).toBeDefined()
  })
})

describe('listV2.updateUnit (attachment)', () => {
  it('sets warlord flag', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({
      name: 'Warlord test',
      edition: '11th',
      battleSize: 'unknown',
    })
    const { id: unitId } = await caller.listV2.addUnit({ listId, points: 90, isWarlord: false })
    await caller.listV2.updateUnit({ id: unitId, isWarlord: true })
    const fetched = await caller.listV2.get({ id: listId })
    expect(fetched.units[0]!.isWarlord).toBe(true)
  })

  it('sets leader attachment', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({
      name: 'Attach test',
      edition: '11th',
      battleSize: 'unknown',
    })
    const { id: bodyguardId } = await caller.listV2.addUnit({
      listId,
      points: 90,
      isWarlord: false,
    })
    const { id: charId } = await caller.listV2.addUnit({ listId, points: 45, isWarlord: false })
    await caller.listV2.updateUnit({
      id: charId,
      attachedToUnitId: bodyguardId,
      attachRole: 'leader',
    })
    const fetched = await caller.listV2.get({ id: listId })
    const char = fetched.units.find((u) => u.id === charId)
    expect(char!.attachedToUnitId).toBe(bodyguardId)
    expect(char!.attachRole).toBe('leader')
  })

  it('rejects second leader on same bodyguard (slot constraint)', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({
      name: 'Slot test',
      edition: '11th',
      battleSize: 'unknown',
    })
    const { id: bodyguardId } = await caller.listV2.addUnit({
      listId,
      points: 90,
      isWarlord: false,
    })
    const { id: char1Id } = await caller.listV2.addUnit({ listId, points: 45, isWarlord: false })
    const { id: char2Id } = await caller.listV2.addUnit({ listId, points: 45, isWarlord: false })
    await caller.listV2.updateUnit({
      id: char1Id,
      attachedToUnitId: bodyguardId,
      attachRole: 'leader',
    })
    await expect(
      caller.listV2.updateUnit({
        id: char2Id,
        attachedToUnitId: bodyguardId,
        attachRole: 'leader',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('can_lead: allows attachment when (leader_ds, bodyguard_ds) is in content_can_lead', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({
      name: 'CanLead positive',
      edition: '11th',
      battleSize: 'unknown',
    })
    const { id: bgId } = await caller.listV2.addUnit({
      listId,
      datasheetId: 'ds-intercessors',
      points: 90,
      isWarlord: false,
    })
    const { id: leaderId } = await caller.listV2.addUnit({
      listId,
      datasheetId: 'ds-captain',
      points: 90,
      isWarlord: false,
    })
    await caller.listV2.updateUnit({
      id: leaderId,
      attachedToUnitId: bgId,
      attachRole: 'leader',
    })
    const fetched = await caller.listV2.get({ id: listId })
    const ldr = fetched.units.find((u) => u.id === leaderId)
    expect(ldr!.attachedToUnitId).toBe(bgId)
  })

  it('can_lead: rejects attachment when (leader_ds, bodyguard_ds) is NOT in content_can_lead', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({
      name: 'CanLead negative',
      edition: '11th',
      battleSize: 'unknown',
    })
    const { id: bgId } = await caller.listV2.addUnit({
      listId,
      datasheetId: 'ds-terminators', // Captain has NO can_lead → Terminators entry
      points: 200,
      isWarlord: false,
    })
    const { id: leaderId } = await caller.listV2.addUnit({
      listId,
      datasheetId: 'ds-captain',
      points: 90,
      isWarlord: false,
    })
    await expect(
      caller.listV2.updateUnit({
        id: leaderId,
        attachedToUnitId: bgId,
        attachRole: 'leader',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('can_lead: skips check when either endpoint has no datasheet_id (stub unit)', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({
      name: 'CanLead stub',
      edition: '11th',
      battleSize: 'unknown',
    })
    const { id: bgId } = await caller.listV2.addUnit({ listId, points: 90, isWarlord: false })
    const { id: leaderId } = await caller.listV2.addUnit({
      listId,
      points: 90,
      isWarlord: false,
    })
    // No datasheet_id on either → can_lead is skipped, slot constraint still applies
    await expect(
      caller.listV2.updateUnit({
        id: leaderId,
        attachedToUnitId: bgId,
        attachRole: 'leader',
      }),
    ).resolves.toMatchObject({ success: true })
  })
})

describe('listV2 read-only validity (snapshot is authoritative)', () => {
  it('getAll returns saved totalPoints without recomputing', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({
      name: 'Snapshot test',
      edition: '11th',
      battleSize: 'unknown',
    })
    await caller.listV2.addUnit({ listId, points: 90, isWarlord: false })
    await caller.listV2.update({ id: listId, totalPoints: 500 }) // set a deliberate snapshot
    const all = await caller.listV2.getAll()
    const found = all.find((l) => l.id === listId)
    expect(found!.totalPoints).toBe(500) // snapshot returned as-is
  })

  it('computePoints sums unit points and updates snapshot', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({
      name: 'Recompute test',
      edition: '11th',
      battleSize: 'unknown',
    })
    await caller.listV2.addUnit({ listId, points: 90, isWarlord: false })
    await caller.listV2.addUnit({ listId, points: 45, isWarlord: false })
    const { totalPoints } = await caller.listV2.computePoints({ listId })
    expect(totalPoints).toBe(135)
    const fetched = await caller.listV2.get({ id: listId })
    expect(fetched.totalPoints).toBe(135)
  })
})

describe('no-scratch-row invariant', () => {
  it('addUnit into a nonexistent list is rejected (FORBIDDEN)', async () => {
    const caller = createCaller(ctx)
    await expect(
      caller.listV2.addUnit({ listId: 'nonexistent-list', points: 90, isWarlord: false }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
