import { createClient } from '@libsql/client'
import {
  authUsers,
  contentCanLead,
  contentEntity,
  createDbFromClient,
  dimDataslate,
  list,
  listUnit,
  listUnitLoadout,
  listUnitLoadoutWeapon,
} from '@tabletop-tools/db'
import { createTestTables } from '@tabletop-tools/db/src/test-ddl'
import { createCallerFactory } from '@tabletop-tools/server-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { appRouter } from './index'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

beforeAll(async () => {
  await client.execute('PRAGMA foreign_keys = ON')
  await createTestTables(client, {
    authUsers,
    dimDataslate,
    contentEntity,
    contentCanLead,
    list,
    listUnit,
    listUnitLoadout,
    listUnitLoadoutWeapon,
  })
  await client.executeMultiple(`
    INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at) VALUES
      ('u-1', 'Alice', 'a@test.com', 0, 0, 0),
      ('u-2', 'Bob', 'b@test.com', 0, 0, 0);
    INSERT INTO content_entity (id, type, name, updated_at) VALUES
      ('w-sword', 'weapon', 'Power Sword', 0),
      ('ds-captain', 'datasheet', 'Captain', 0),
      ('ds-intercessors', 'datasheet', 'Intercessors', 0),
      ('ds-terminators', 'datasheet', 'Terminators', 0),
      ('ds-librarian', 'datasheet', 'Librarian', 0);
    INSERT INTO content_entity (id, type, name, can_deploy_solo, updated_at) VALUES
      ('ds-support-only', 'datasheet', 'Support-Only Char', 0, 0);
    INSERT INTO content_can_lead (leader_datasheet_id, bodyguard_datasheet_id, role) VALUES
      ('ds-captain', 'ds-intercessors', 'leader'),
      ('ds-librarian', 'ds-intercessors', 'support'),
      ('ds-support-only', 'ds-intercessors', 'support');
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

describe('listV2.updateUnit (role-aware attachment)', () => {
  it('allows leader attach when (leader, bodyguard, leader) row exists', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({
      name: 'RoleTest',
      edition: '11th',
      battleSize: 'unknown',
    })
    const { id: bgId } = await caller.listV2.addUnit({
      listId,
      datasheetId: 'ds-intercessors',
      points: 90,
      isWarlord: false,
    })
    const { id: captainId } = await caller.listV2.addUnit({
      listId,
      datasheetId: 'ds-captain',
      points: 90,
      isWarlord: false,
    })
    await expect(
      caller.listV2.updateUnit({ id: captainId, attachedToUnitId: bgId, attachRole: 'leader' }),
    ).resolves.toMatchObject({ success: true })
  })

  it('rejects leader attach when only a support row exists for that pair', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({
      name: 'RoleRejectTest',
      edition: '11th',
      battleSize: 'unknown',
    })
    const { id: bgId } = await caller.listV2.addUnit({
      listId,
      datasheetId: 'ds-intercessors',
      points: 90,
      isWarlord: false,
    })
    const { id: libId } = await caller.listV2.addUnit({
      listId,
      datasheetId: 'ds-librarian',
      points: 90,
      isWarlord: false,
    })
    // Librarian only has a 'support' row — cannot attach as Leader
    await expect(
      caller.listV2.updateUnit({ id: libId, attachedToUnitId: bgId, attachRole: 'leader' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('allows support attach when (leader, bodyguard, support) row exists', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({
      name: 'SupportTest',
      edition: '11th',
      battleSize: 'unknown',
    })
    const { id: bgId } = await caller.listV2.addUnit({
      listId,
      datasheetId: 'ds-intercessors',
      points: 90,
      isWarlord: false,
    })
    const { id: libId } = await caller.listV2.addUnit({
      listId,
      datasheetId: 'ds-librarian',
      points: 90,
      isWarlord: false,
    })
    await expect(
      caller.listV2.updateUnit({ id: libId, attachedToUnitId: bgId, attachRole: 'support' }),
    ).resolves.toMatchObject({ success: true })
  })

  it('rejects second support on the same bodyguard (slot constraint)', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({
      name: 'SupportSlot',
      edition: '11th',
      battleSize: 'unknown',
    })
    const { id: bgId } = await caller.listV2.addUnit({
      listId,
      datasheetId: 'ds-intercessors',
      points: 90,
      isWarlord: false,
    })
    const { id: lib1Id } = await caller.listV2.addUnit({
      listId,
      datasheetId: 'ds-librarian',
      points: 90,
      isWarlord: false,
    })
    const { id: lib2Id } = await caller.listV2.addUnit({
      listId,
      datasheetId: 'ds-support-only',
      points: 90,
      isWarlord: false,
    })
    await caller.listV2.updateUnit({ id: lib1Id, attachedToUnitId: bgId, attachRole: 'support' })
    await expect(
      caller.listV2.updateUnit({ id: lib2Id, attachedToUnitId: bgId, attachRole: 'support' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('rejects solo deployment for a can_deploy_solo=false unit', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({
      name: 'MustAttach',
      edition: '11th',
      battleSize: 'unknown',
    })
    const { id: bgId } = await caller.listV2.addUnit({
      listId,
      datasheetId: 'ds-intercessors',
      points: 90,
      isWarlord: false,
    })
    // Add the support-only unit already attached (addUnit doesn't enforce can_deploy_solo)
    const { id: soId } = await caller.listV2.addUnit({
      listId,
      datasheetId: 'ds-support-only',
      points: 90,
      isWarlord: false,
      attachedToUnitId: bgId,
      attachRole: 'support',
    })
    // Trying to clear the attachment on a can_deploy_solo=false unit → rejected
    await expect(
      caller.listV2.updateUnit({ id: soId, attachedToUnitId: null, attachRole: null }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})

describe('listV2.eligibleBodyguards', () => {
  it('returns list units whose datasheet is in content_can_lead for the given leader + role', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({
      name: 'EligibleTest',
      edition: '11th',
      battleSize: 'unknown',
    })
    const { id: bgId } = await caller.listV2.addUnit({
      listId,
      datasheetId: 'ds-intercessors',
      points: 90,
      isWarlord: false,
    })
    // Terminators: no can_lead row for Captain → not returned
    const { id: termId } = await caller.listV2.addUnit({
      listId,
      datasheetId: 'ds-terminators',
      points: 200,
      isWarlord: false,
    })
    const result = await caller.listV2.eligibleBodyguards({
      listId,
      datasheetId: 'ds-captain',
      role: 'leader',
    })
    expect(result.map((u) => u.id)).toContain(bgId)
    expect(result.map((u) => u.id)).not.toContain(termId)
  })

  it('returns empty array when no eligible bodyguards exist for the given role', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({
      name: 'NoEligible',
      edition: '11th',
      battleSize: 'unknown',
    })
    // Only Terminators in the list — Captain has no leader row for Terminators
    await caller.listV2.addUnit({
      listId,
      datasheetId: 'ds-terminators',
      points: 200,
      isWarlord: false,
    })
    const result = await caller.listV2.eligibleBodyguards({
      listId,
      datasheetId: 'ds-captain',
      role: 'leader',
    })
    expect(result).toHaveLength(0)
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
