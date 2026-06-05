# List-Builder 11th-Edition Support Attachment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the 11th-edition Support character attachment gap — schema, producer scaffold, role-aware server enforcement, and UI picker — so that Leader and Support roles are distinct, data-driven, and enforceable end-to-end.

**Architecture:** Add a `role` column to `content_can_lead` (PK becomes `(leader, bodyguard, role)`); add `can_deploy_solo` flag to `content_entity`; update the `updateUnit` router to filter by role; add a `produceCanSupport` scaffold in the data-import producer; add an `eligibleBodyguards` tRPC procedure; wire an `AttachmentPicker` component into `UnitRow` for CHARACTER units. Delete the dead `list-attachment.ts` helper.

**Tech Stack:** TypeScript, Drizzle ORM + libSQL (Turso), tRPC + Zod, React, Vitest, Playwright

---

## Data-gap acknowledgement (read before implementing)

The 11th-leak `reference.md` (§19.01, §24.34) confirms the Support rule exists but contains **no per-character Support attachment lists**. `produceCanSupport` will be wired and correct but will produce **0 rows** until a per-codex 11th-ed source lands. The "support-only cannot deploy solo" rule is plausible but no specific characters have been identified — `can_deploy_solo` defaults to `true`, so no existing data is affected. Both gaps are explicitly tracked in the worklist update (Task 7).

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `packages/db/src/schema.ts` | Modify | Add `role` column to `contentCanLead`; add `canDeploySolo` to `contentEntity` |
| `packages/db/migrations/0012_attachment_role.sql` | Create (via drizzle-kit) | Migration: add role column, backfill 'leader', drop old PK, add new PK |
| `packages/db/src/list-attachment.ts` | Delete | Dead code — router does inline validation |
| `packages/db/src/list-attachment.test.ts` | Delete | Tests for deleted dead code |
| `packages/db/src/index.ts` | Modify | Remove `list-attachment` export |
| `packages/db/src/schema.test.ts` | Modify | Update `content_can_lead` CREATE TABLE DDL; add `can_deploy_solo` to `content_entity` CREATE |
| `apps/data-import/server/src/lib/content-producer.ts` | Modify | Add `role` field to `LeaderAttachmentRecord`; update `produceCanLead`; add `produceCanSupport` scaffold |
| `apps/data-import/server/src/lib/sync.ts` | Modify | Wire `produceCanSupport` after `produceCanLead` |
| `apps/list-builder/server/src/routers/list-v2.ts` | Modify | Role-aware `content_can_lead` query; `can_deploy_solo` solo-check; new `eligibleBodyguards` + `canDeploySolo` procedures |
| `apps/list-builder/server/src/routers/list-v2.test.ts` | Modify | Update setup DDL; add 6 new role-aware tests |
| `apps/list-builder/client/src/components/UnitSelectionScreen.tsx` | Modify | Add `AttachmentPicker` component; wire into `UnitRow` |
| `apps/list-builder/client/src/lib/useListsV2.ts` | Modify | Add `useEligibleBodyguards` + `useCanDeploySolo` hooks; add `useEligibleBodyguardsQuery` |
| `apps/list-builder/client/src/components/UnitSelectionScreen.test.tsx` | Create | AttachmentPicker unit tests |
| `e2e/specs/list-builder-support.spec.ts` | Create | Playwright e2e: leader attach, support attach, rejection |
| `docs/superpowers/plans/2026-05-29-data-layer-worklist.md` | Modify | Add support-mechanics row + data-gap TODO |

---

## Task 1: Schema — add `role` column and `can_deploy_solo` flag

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/migrations/0012_attachment_role.sql` (via drizzle-kit generate)

### Step 1: Update schema.ts — `contentEntity` gains `canDeploySolo`

In `packages/db/src/schema.ts`, find the `contentEntity` table definition (around line 1206). Add `canDeploySolo` column after `bsdataId`:

```typescript
canDeploySolo: integer('can_deploy_solo', { mode: 'boolean' }).notNull().default(true),
```

### Step 2: Update schema.ts — `contentCanLead` gains `role` column and new PK

Find the `contentCanLead` table (around line 1352). The full new definition:

```typescript
export const contentCanLead = sqliteTable(
  'content_can_lead',
  {
    leaderDatasheetId: text('leader_datasheet_id')
      .notNull()
      .references(() => contentEntity.id, { onDelete: 'cascade' }),
    bodyguardDatasheetId: text('bodyguard_datasheet_id')
      .notNull()
      .references(() => contentEntity.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['leader', 'support'] }).notNull().default('leader'),
  },
  (table) => [
    primaryKey({ columns: [table.leaderDatasheetId, table.bodyguardDatasheetId, table.role] }),
    index('idx_can_lead_leader').on(table.leaderDatasheetId),
    index('idx_can_lead_bodyguard').on(table.bodyguardDatasheetId),
    index('idx_can_lead_role').on(table.role),
  ],
)
```

- [ ] Make the two edits above to `packages/db/src/schema.ts`.

### Step 3: Generate the migration

```bash
cd packages/db && npx drizzle-kit generate
```

Expected: creates `packages/db/migrations/0012_attachment_role.sql` (or similar name). The file should contain:
1. ALTER TABLE adding `role` column with DEFAULT 'leader'
2. An UPDATE setting `role = 'leader'` on all existing rows (may be implicit from DEFAULT)
3. Drop of old PRIMARY KEY and creation of new one including `role`
4. ALTER TABLE adding `can_deploy_solo` to `content_entity`

**Important:** SQLite does not support DROP PRIMARY KEY via ALTER TABLE. Drizzle-kit will generate a table-recreation migration (CREATE TABLE new + INSERT SELECT + DROP + RENAME). This is correct. Do not edit the generated SQL unless drizzle-kit produces a syntax error.

- [ ] Run `npx drizzle-kit generate` from `packages/db/`.
- [ ] Review the generated `.sql` file — confirm it handles the PK change and the `can_deploy_solo` addition.
- [ ] If drizzle-kit splits into two files (one per table), that is fine — keep both.

### Step 4: Apply migration to in-memory test DB (verify)

```bash
cd packages/db && pnpm test
```

Expected: all existing schema tests pass. If a CREATE TABLE in `schema.test.ts` now fails because it references the old `content_can_lead` schema, you will fix those in Task 2.

- [ ] Run tests. Note any failures (expected at this point — Task 2 fixes them).

---

## Task 2: Update `schema.test.ts` + delete dead code

**Files:**
- Modify: `packages/db/src/schema.test.ts`
- Delete: `packages/db/src/list-attachment.ts`
- Modify: `packages/db/src/index.ts`

### Step 1: Update the `content_can_lead` CREATE TABLE in schema.test.ts

Find the existing `CREATE TABLE content_can_lead` statement in `beforeAll`. Replace with the role-aware version:

```sql
CREATE TABLE content_can_lead (
  leader_datasheet_id TEXT NOT NULL REFERENCES content_entity(id) ON DELETE CASCADE,
  bodyguard_datasheet_id TEXT NOT NULL REFERENCES content_entity(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'leader',
  PRIMARY KEY (leader_datasheet_id, bodyguard_datasheet_id, role)
);
```

### Step 2: Update `content_entity` CREATE TABLE in schema.test.ts

Add `can_deploy_solo INTEGER NOT NULL DEFAULT 1` to the `content_entity` CREATE TABLE in `beforeAll`:

```sql
CREATE TABLE content_entity (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  faction_id TEXT,
  parent_id TEXT,
  dataslate_id TEXT,
  r2_key TEXT,
  wahapedia_id TEXT,
  bsdata_id TEXT,
  can_deploy_solo INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
```

### Step 3: Delete dead code

- [ ] Delete file `packages/db/src/list-attachment.ts` (the `validateAttachment` helper is dead — the router has its own inline logic and `list-attachment.ts` exports only this helper).
- [ ] Delete file `packages/db/src/list-attachment.test.ts` (tests for the deleted dead-code helper).
- [ ] In `packages/db/src/index.ts`, remove the line `export * from './list-attachment'`.

### Step 4: Verify

```bash
cd packages/db && pnpm test
```

- [ ] All tests pass. No reference to `list-attachment` exports anywhere (grep to confirm).

```bash
grep -rn "list-attachment\|validateAttachment" C:/R/tabletop-tools --include="*.ts"
```

Expected: 0 matches. (Both `list-attachment.ts` and `list-attachment.test.ts` are deleted; `index.ts` export line is removed.)

---

## Task 3: Update the data-import producer — role-aware `produceCanLead` + `produceCanSupport` scaffold

**Files:**
- Modify: `apps/data-import/server/src/lib/content-producer.ts`
- Modify: `apps/data-import/server/src/lib/sync.ts`

### Step 1: Write a failing test (producer handles role field)

In the existing producer test file (or `sync.test.ts` if applicable), there should be tests for `produceCanLead`. Check:

```bash
grep -r "produceCanLead\|produceCanSupport" C:/R/tabletop-tools/apps/data-import --include="*.test.ts" -l
```

If no test file exists for producer, create `apps/data-import/server/src/lib/content-producer.test.ts`:

```typescript
import { createClient } from '@libsql/client'
import { createDbFromClient } from '@tabletop-tools/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { produceCanLead, produceCanSupport } from './content-producer'

const client = createClient({ url: ':memory:' })
const db = createDbFromClient(client)

beforeAll(async () => {
  await client.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE content_entity (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, faction_id TEXT, parent_id TEXT, dataslate_id TEXT, r2_key TEXT, wahapedia_id TEXT, bsdata_id TEXT, can_deploy_solo INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL);
    CREATE TABLE content_can_lead (
      leader_datasheet_id TEXT NOT NULL REFERENCES content_entity(id) ON DELETE CASCADE,
      bodyguard_datasheet_id TEXT NOT NULL REFERENCES content_entity(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'leader',
      PRIMARY KEY (leader_datasheet_id, bodyguard_datasheet_id, role)
    );
    INSERT INTO content_entity VALUES ('ds-a', 'datasheet', 'UnitA', NULL, NULL, NULL, NULL, NULL, NULL, 1, 0);
    INSERT INTO content_entity VALUES ('ds-b', 'datasheet', 'UnitB', NULL, NULL, NULL, NULL, NULL, NULL, 1, 0);
  `)
})

afterAll(() => client.close())

describe('produceCanLead', () => {
  it('writes role=leader rows from leader_attachments', async () => {
    const r = await produceCanLead(db, [{ leaderId: 'ds-a', attachedId: 'ds-b', role: 'leader' }], new Set(['ds-a', 'ds-b']))
    expect(r.rowsWritten).toBe(1)
    const rows = await client.execute('SELECT * FROM content_can_lead WHERE role = ?', ['leader'])
    expect(rows.rows).toHaveLength(1)
  })

  it('defaults to role=leader when role field is absent (backward compat)', async () => {
    // reset
    await client.execute('DELETE FROM content_can_lead')
    const r = await produceCanLead(db, [{ leaderId: 'ds-a', attachedId: 'ds-b' }], new Set(['ds-a', 'ds-b']))
    expect(r.rowsWritten).toBe(1)
    const rows = await client.execute('SELECT role FROM content_can_lead')
    expect(rows.rows[0]?.role).toBe('leader')
  })

  it('drops pairs where endpoint is not in validDatasheetIds', async () => {
    await client.execute('DELETE FROM content_can_lead')
    const r = await produceCanLead(db, [{ leaderId: 'ds-x', attachedId: 'ds-b', role: 'leader' }], new Set(['ds-a', 'ds-b']))
    expect(r.rowsWritten).toBe(0)
    expect(r.dropped).toBe(1)
  })
})

describe('produceCanSupport', () => {
  it('is a no-op scaffold — writes 0 rows when given empty input', async () => {
    await client.execute('DELETE FROM content_can_lead')
    const r = await produceCanSupport(db, [], new Set(['ds-a', 'ds-b']))
    // No 11th-ed per-codex support data ingested yet — scaffold produces 0 rows.
    expect(r.rowsWritten).toBe(0)
  })

  it('writes role=support rows when support_attachments data is provided', async () => {
    await client.execute('DELETE FROM content_can_lead')
    const r = await produceCanSupport(db, [{ leaderId: 'ds-a', attachedId: 'ds-b' }], new Set(['ds-a', 'ds-b']))
    expect(r.rowsWritten).toBe(1)
    const rows = await client.execute('SELECT role FROM content_can_lead WHERE role = ?', ['support'])
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]?.role).toBe('support')
  })
})
```

- [ ] Write the test file (or add to existing producer tests).
- [ ] Run it to confirm it fails (functions don't exist yet / wrong signature).

```bash
cd apps/data-import/server && pnpm test -- --reporter=verbose content-producer
```

### Step 2: Update `produceCanLead` and add `produceCanSupport`

In `apps/data-import/server/src/lib/content-producer.ts`:

**Update `LeaderAttachmentRecord`:**

```typescript
export interface LeaderAttachmentRecord {
  id?: string
  leaderId: string
  attachedId: string
  /** Defaults to 'leader' when absent — backward compat with Wahapedia source. */
  role?: 'leader' | 'support'
}
```

**Update `produceCanLead` body** — include `role` in each pushed row (defaulting to `'leader'`):

```typescript
export async function produceCanLead(
  db: Db | undefined,
  attachments: LeaderAttachmentRecord[],
  validDatasheetIds: Set<string>,
): Promise<{ type: 'can_lead'; rowsWritten: number; dropped: number }> {
  if (!db) return { type: 'can_lead', rowsWritten: 0, dropped: 0 }
  const valid: Array<{ leaderDatasheetId: string; bodyguardDatasheetId: string; role: 'leader' | 'support' }> = []
  let dropped = 0
  for (const a of attachments) {
    if (validDatasheetIds.has(a.leaderId) && validDatasheetIds.has(a.attachedId)) {
      valid.push({
        leaderDatasheetId: a.leaderId,
        bodyguardDatasheetId: a.attachedId,
        role: a.role ?? 'leader',
      })
    } else {
      dropped++
    }
  }
  const CHUNK = 100
  let rowsWritten = 0
  for (let i = 0; i < valid.length; i += CHUNK) {
    const chunk = valid.slice(i, i + CHUNK)
    await db.insert(contentCanLead).values(chunk).onConflictDoNothing()
    rowsWritten += chunk.length
  }
  return { type: 'can_lead', rowsWritten, dropped }
}
```

**Add `produceCanSupport` scaffold:**

```typescript
/**
 * Scaffold producer for 11th-edition Support attachments.
 *
 * Support characters list which Bodyguard units they can join (§24.34, rule
 * SUPPORT / Appui). This is distinct from the Leader ability. Per-character
 * support lists will come from a future 11th-ed per-codex source.
 *
 * DATA GAP: As of 2026-06-01, no ingested source provides per-character Support
 * attachment data. The 11th-leak reference.md confirms the rule exists but
 * contains no character-level lists. This function is wired into runSync so
 * the path exists — it will produce 0 rows until a source is added.
 *
 * When support data becomes available, pass it here. Rows are written with
 * role='support', so they are immediately queryable by the role-aware
 * updateUnit + eligibleBodyguards endpoints.
 */
export async function produceCanSupport(
  db: Db | undefined,
  attachments: LeaderAttachmentRecord[],
  validDatasheetIds: Set<string>,
): Promise<{ type: 'can_support'; rowsWritten: number; dropped: number }> {
  const r = await produceCanLead(db, attachments.map(a => ({ ...a, role: 'support' as const })), validDatasheetIds)
  return { type: 'can_support', rowsWritten: r.rowsWritten, dropped: r.dropped }
}
```

- [ ] Apply the edits above.

### Step 3: Wire `produceCanSupport` into `sync.ts`

In `apps/data-import/server/src/lib/sync.ts`, import `produceCanSupport` from `content-producer`. After the `produceCanLead` block (around line 466), add:

```typescript
// content_can_support (11th-ed Support ability characters).
// DATA GAP: no per-codex 11th-ed source yet — scaffold runs and produces 0 rows.
// When support data arrives via a sources/* file, pass it here as supportAttachments.
try {
  const supportAttachments: LeaderAttachmentRecord[] = []
  const r = await produceCanSupport(db, supportAttachments, canonicalDatasheetIdsFiltered)
  if (r.rowsWritten > 0) {
    producer['can_support'] = { r2DocsWritten: 0, contentEntityUpserts: r.rowsWritten }
  }
} catch (err) {
  errors.push(
    `Content producer (can_support): ${err instanceof Error ? err.message : String(err)}`,
  )
}
```

Also update the import at the top of `sync.ts`:

```typescript
import {
  // ... existing imports ...
  produceCanSupport,
} from './content-producer'
```

- [ ] Apply the edits above.

### Step 4: Verify

```bash
cd apps/data-import/server && pnpm test
```

Expected: all tests pass including the new producer tests.

- [ ] Commit:

```bash
git add packages/db/src/schema.ts packages/db/migrations/ packages/db/src/schema.test.ts packages/db/src/index.ts packages/db/src/list-attachment.ts packages/db/src/list-attachment.test.ts apps/data-import/server/src/lib/content-producer.ts apps/data-import/server/src/lib/sync.ts
git commit -m "feat(db+data-import): role-aware content_can_lead — add role column to PK, produceCanSupport scaffold

Adds role column (leader|support) to content_can_lead, making the PK
(leader, bodyguard, role). Existing rows default to role='leader'.
Adds can_deploy_solo flag to content_entity (default true — no data
change).

produceCanLead now includes role in each written row (backward compat:
defaults to 'leader' when caller omits the field). produceCanSupport
scaffold wired into runSync — writes 0 rows until a per-codex 11th-ed
support-attachment source is added (data gap acknowledged in code comment).

Deletes dead packages/db/src/list-attachment.ts (validateAttachment was
never called by any router; inline logic in list-v2.ts is the real path)."
```

---

## Task 4: Role-aware server logic — `updateUnit` + new procedures

**Files:**
- Modify: `apps/list-builder/server/src/routers/list-v2.ts`
- Modify: `apps/list-builder/server/src/routers/list-v2.test.ts`

### Step 1: Write failing tests first

In `apps/list-builder/server/src/routers/list-v2.test.ts`:

**Update the `beforeAll` schema** — the `content_can_lead` CREATE TABLE and seed INSERT now include `role`:

```sql
CREATE TABLE content_can_lead (
  leader_datasheet_id TEXT NOT NULL REFERENCES content_entity(id) ON DELETE CASCADE,
  bodyguard_datasheet_id TEXT NOT NULL REFERENCES content_entity(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'leader',
  PRIMARY KEY (leader_datasheet_id, bodyguard_datasheet_id, role)
);
-- Seed: Captain can LEAD Intercessors, but NOT support them
INSERT INTO content_can_lead VALUES ('ds-captain', 'ds-intercessors', 'leader');
-- Seed: Librarian can SUPPORT Intercessors only
INSERT INTO content_entity VALUES ('ds-librarian', 'datasheet', 'Librarian', NULL, NULL, NULL, NULL, NULL, NULL, 1, 0);
INSERT INTO content_can_lead VALUES ('ds-librarian', 'ds-intercessors', 'support');
-- Seed: A support-only character (can_deploy_solo = false)
INSERT INTO content_entity VALUES ('ds-support-only', 'datasheet', 'Support-Only Char', NULL, NULL, NULL, NULL, NULL, NULL, 0, 0);
INSERT INTO content_can_lead VALUES ('ds-support-only', 'ds-intercessors', 'support');
```

Also update the existing `content_entity` CREATE TABLE DDL in the `beforeAll` to include `can_deploy_solo INTEGER NOT NULL DEFAULT 1`, and update all existing `INSERT INTO content_entity` lines to include the `can_deploy_solo` value (`1` for existing entries).

**Add new `describe` block** after the existing attachment tests:

```typescript
describe('listV2.updateUnit (role-aware attachment)', () => {
  it('allows leader attach when (leader, bodyguard, leader) row exists', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({ name: 'RoleTest', edition: '11th', battleSize: 'unknown' })
    const { id: bgId } = await caller.listV2.addUnit({ listId, datasheetId: 'ds-intercessors', points: 90, isWarlord: false })
    const { id: captainId } = await caller.listV2.addUnit({ listId, datasheetId: 'ds-captain', points: 90, isWarlord: false })
    await expect(
      caller.listV2.updateUnit({ id: captainId, attachedToUnitId: bgId, attachRole: 'leader' })
    ).resolves.toMatchObject({ success: true })
  })

  it('rejects leader attach when only a support row exists for that pair', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({ name: 'RoleRejectTest', edition: '11th', battleSize: 'unknown' })
    const { id: bgId } = await caller.listV2.addUnit({ listId, datasheetId: 'ds-intercessors', points: 90, isWarlord: false })
    const { id: libId } = await caller.listV2.addUnit({ listId, datasheetId: 'ds-librarian', points: 90, isWarlord: false })
    // Librarian only has a 'support' row, not a 'leader' row
    await expect(
      caller.listV2.updateUnit({ id: libId, attachedToUnitId: bgId, attachRole: 'leader' })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('allows support attach when (leader, bodyguard, support) row exists', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({ name: 'SupportTest', edition: '11th', battleSize: 'unknown' })
    const { id: bgId } = await caller.listV2.addUnit({ listId, datasheetId: 'ds-intercessors', points: 90, isWarlord: false })
    const { id: libId } = await caller.listV2.addUnit({ listId, datasheetId: 'ds-librarian', points: 90, isWarlord: false })
    await expect(
      caller.listV2.updateUnit({ id: libId, attachedToUnitId: bgId, attachRole: 'support' })
    ).resolves.toMatchObject({ success: true })
  })

  it('rejects second support on the same bodyguard (slot constraint)', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({ name: 'SupportSlot', edition: '11th', battleSize: 'unknown' })
    const { id: bgId } = await caller.listV2.addUnit({ listId, datasheetId: 'ds-intercessors', points: 90, isWarlord: false })
    const { id: lib1Id } = await caller.listV2.addUnit({ listId, datasheetId: 'ds-librarian', points: 90, isWarlord: false })
    const { id: lib2Id } = await caller.listV2.addUnit({ listId, datasheetId: 'ds-librarian', points: 90, isWarlord: false })
    await caller.listV2.updateUnit({ id: lib1Id, attachedToUnitId: bgId, attachRole: 'support' })
    await expect(
      caller.listV2.updateUnit({ id: lib2Id, attachedToUnitId: bgId, attachRole: 'support' })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('rejects solo deployment for a can_deploy_solo=false unit', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({ name: 'MustAttach', edition: '11th', battleSize: 'unknown' })
    // Add as already-attached then try to detach
    const { id: bgId } = await caller.listV2.addUnit({ listId, datasheetId: 'ds-intercessors', points: 90, isWarlord: false })
    const { id: soId } = await caller.listV2.addUnit({
      listId,
      datasheetId: 'ds-support-only',
      points: 90,
      isWarlord: false,
      attachedToUnitId: bgId,
      attachRole: 'support',
    })
    // Trying to set attachedToUnitId to null for a support-only char should be rejected
    await expect(
      caller.listV2.updateUnit({ id: soId, attachedToUnitId: null, attachRole: null })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})

describe('listV2.eligibleBodyguards', () => {
  it('returns list units whose datasheet is in content_can_lead for the given leader + role', async () => {
    const caller = createCaller(ctx)
    const { id: listId } = await caller.listV2.create({ name: 'EligibleTest', edition: '11th', battleSize: 'unknown' })
    const { id: bgId } = await caller.listV2.addUnit({ listId, datasheetId: 'ds-intercessors', points: 90, isWarlord: false })
    // Terminators: no can_lead row for Captain → not returned
    const { id: termId } = await caller.listV2.addUnit({ listId, datasheetId: 'ds-terminators', points: 200, isWarlord: false })
    const result = await caller.listV2.eligibleBodyguards({ listId, datasheetId: 'ds-captain', role: 'leader' })
    expect(result.map(u => u.id)).toContain(bgId)
    expect(result.map(u => u.id)).not.toContain(termId)
  })
})
```

- [ ] Write all the test additions above.
- [ ] Run tests to confirm they fail:

```bash
cd apps/list-builder/server && pnpm test -- --reporter=verbose
```

Expected: failing on role-aware query, missing `eligibleBodyguards` procedure, `can_deploy_solo` check not present.

### Step 2: Update `updateUnit` in `list-v2.ts` — role-aware query

Replace the `content_can_lead` query inside `updateUnit` (the block starting with `if (leaderDsId && bodyguardDsId)`) with a role-filtered query:

```typescript
if (leaderDsId && bodyguardDsId) {
  const can = await ctx.db
    .select()
    .from(contentCanLead)
    .where(
      and(
        eq(contentCanLead.leaderDatasheetId, leaderDsId),
        eq(contentCanLead.bodyguardDatasheetId, bodyguardDsId),
        eq(contentCanLead.role, input.attachRole),
      ),
    )
    .limit(1)
  if (can.length === 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `datasheet ${leaderDsId} cannot ${input.attachRole} ${bodyguardDsId} (no can_lead entry for role=${input.attachRole})`,
    })
  }
}
```

### Step 3: Add `can_deploy_solo` check to `updateUnit`

Add this block BEFORE the existing attachment constraint checks in `updateUnit`. It fires when the caller is trying to set `attachedToUnitId` to null on a unit whose datasheet has `can_deploy_solo = false`:

```typescript
// can_deploy_solo enforcement: a unit marked can_deploy_solo=false must remain attached.
// (Applies when explicitly clearing the attachment — not on addUnit which starts unattached.)
if (input.attachedToUnitId === null && unit[0]!.datasheetId) {
  const dsRow = await ctx.db
    .select({ canDeploySolo: contentEntity.canDeploySolo })
    .from(contentEntity)
    .where(eq(contentEntity.id, unit[0]!.datasheetId))
    .limit(1)
  if (dsRow.length > 0 && dsRow[0]!.canDeploySolo === false) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `${unit[0]!.datasheetId} cannot deploy solo (can_deploy_solo=false)`,
    })
  }
}
```

Import `contentEntity` at the top of `list-v2.ts` (it is currently only importing `contentCanLead`):

```typescript
import {
  contentCanLead,
  contentEntity,
  list,
  listUnit,
  listUnitLoadout,
  listUnitLoadoutWeapon,
} from '@tabletop-tools/db'
```

### Step 4: Add `eligibleBodyguards` procedure

Add this new procedure to the `listV2Router` object in `list-v2.ts`:

```typescript
eligibleBodyguards: protectedProcedure
  .input(
    z.object({
      listId: z.string(),
      datasheetId: z.string(),
      role: z.enum(['leader', 'support']),
    }),
  )
  .query(async ({ ctx, input }) => {
    // Verify list ownership
    const parentList = await ctx.db
      .select()
      .from(list)
      .where(and(eq(list.id, input.listId), eq(list.userId, ctx.user.id)))
    if (!parentList.length) throw new TRPCError({ code: 'NOT_FOUND' })

    // Get all datasheet IDs that this character can attach to with this role
    const allowedBodyguardRows = await ctx.db
      .select({ bodyguardDatasheetId: contentCanLead.bodyguardDatasheetId })
      .from(contentCanLead)
      .where(
        and(
          eq(contentCanLead.leaderDatasheetId, input.datasheetId),
          eq(contentCanLead.role, input.role),
        ),
      )
    const allowedDsIds = new Set(allowedBodyguardRows.map((r) => r.bodyguardDatasheetId))
    if (allowedDsIds.size === 0) return []

    // Get list units whose datasheet is in the allowed set
    const units = await ctx.db
      .select()
      .from(listUnit)
      .where(eq(listUnit.listId, input.listId))

    return units.filter(
      (u) => u.datasheetId !== null && allowedDsIds.has(u.datasheetId),
    )
  }),
```

### Step 5: Add `canDeploySolo` procedure

```typescript
canDeploySolo: protectedProcedure
  .input(z.object({ datasheetId: z.string() }))
  .query(async ({ ctx, input }) => {
    const rows = await ctx.db
      .select({ canDeploySolo: contentEntity.canDeploySolo })
      .from(contentEntity)
      .where(eq(contentEntity.id, input.datasheetId))
      .limit(1)
    // If no content_entity row exists for this datasheet, default to true
    // (unknown units are not flagged as must-attach).
    return { canDeploySolo: rows[0]?.canDeploySolo ?? true }
  }),
```

### Step 6: Verify

```bash
cd apps/list-builder/server && pnpm test
```

Expected: all tests pass, including the 6 new ones.

- [ ] Commit:

```bash
git add apps/list-builder/server/src/routers/list-v2.ts apps/list-builder/server/src/routers/list-v2.test.ts
git commit -m "feat(list-builder): role-aware attachment enforcement + eligibleBodyguards procedure

updateUnit now filters content_can_lead by role — a character with only a
'support' row cannot be attached as a Leader, and vice versa.

can_deploy_solo check added: setting attachedToUnitId=null on a unit whose
content_entity.can_deploy_solo=false is rejected with BAD_REQUEST.

New procedures:
  listV2.eligibleBodyguards({ listId, datasheetId, role }) — returns list
    units eligible as bodyguards for a given character + role.
  listV2.canDeploySolo({ datasheetId }) — returns can_deploy_solo flag for
    a given datasheet (defaults to true for unknown datasheets).

6 new server tests covering role-aware enforcement, slot constraint, solo
rejection. Existing 18 tests unchanged (still pass)."
```

---

## Task 5: Client — `AttachmentPicker` component + hooks

**Files:**
- Modify: `apps/list-builder/client/src/lib/useListsV2.ts`
- Modify: `apps/list-builder/client/src/components/UnitSelectionScreen.tsx`
- Create: `apps/list-builder/client/src/components/UnitSelectionScreen.test.tsx` (if not exists — if it does, add tests there)

### Step 1: Add client hooks in `useListsV2.ts`

Add two new hooks after the existing hooks:

```typescript
/**
 * Returns list units eligible as bodyguards for the given character datasheet
 * and role. Disabled when either listId or datasheetId is absent.
 */
export function useEligibleBodyguards(
  listId: string | null,
  datasheetId: string | null,
  role: 'leader' | 'support',
) {
  return trpc.listV2.eligibleBodyguards.useQuery(
    { listId: listId!, datasheetId: datasheetId!, role },
    { enabled: !!listId && !!datasheetId, staleTime: 5_000 },
  )
}

/**
 * Returns whether the given datasheet can deploy solo (not attached).
 * Defaults to true (solo allowed) when the datasheet has no content_entity row.
 */
export function useCanDeploySolo(datasheetId: string | null) {
  return trpc.listV2.canDeploySolo.useQuery(
    { datasheetId: datasheetId! },
    { enabled: !!datasheetId, staleTime: 60_000 },
  )
}
```

Also add an imperative helper:

```typescript
/** Fetch eligible bodyguards for a character + role without a React hook. */
export async function eligibleBodyguardsImperative(input: {
  listId: string
  datasheetId: string
  role: 'leader' | 'support'
}) {
  return trpcClient.listV2.eligibleBodyguards.query(input)
}
```

### Step 2: Write failing client tests

Check if `UnitSelectionScreen.test.tsx` exists:

```bash
ls C:/R/tabletop-tools/apps/list-builder/client/src/components/
```

If `UnitSelectionScreen.test.tsx` exists, add tests there. If not, create it. The tests use the same pattern as `ListBuilderScreen.test.tsx` — mock tRPC, render the component, assert behavior.

Create/add `apps/list-builder/client/src/components/AttachmentPicker.test.tsx`:

```typescript
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AttachmentPicker } from './UnitSelectionScreen' // named export

// Mock tRPC hooks
vi.mock('../lib/trpc', () => ({
  trpc: {
    listV2: {
      eligibleBodyguards: {
        useQuery: vi.fn(),
      },
      canDeploySolo: {
        useQuery: vi.fn(),
      },
    },
  },
}))

// import after mocking
import { trpc } from '../lib/trpc'

afterEach(() => cleanup())

describe('AttachmentPicker', () => {
  it('renders a role selector and bodyguard dropdown for a character unit', async () => {
    vi.mocked(trpc.listV2.eligibleBodyguards.useQuery).mockReturnValue({
      data: [{ id: 'lu-bg', datasheetId: 'ds-intercessors', points: 90, isWarlord: false, attachedToUnitId: null, attachRole: null, enhancementId: null, listId: 'list-1', loadouts: [] }],
      isLoading: false,
    } as any)
    vi.mocked(trpc.listV2.canDeploySolo.useQuery).mockReturnValue({
      data: { canDeploySolo: true },
      isLoading: false,
    } as any)

    const onAttach = vi.fn()
    render(
      <AttachmentPicker
        listId="list-1"
        unit={{ id: 'lu-captain', datasheetId: 'ds-captain', points: 90, isWarlord: false, attachedToUnitId: null, attachRole: null, enhancementId: null, listId: 'list-1', loadouts: [] }}
        getBodyguardName={(datasheetId) => datasheetId ?? 'unknown'}
        onAttach={onAttach}
      />
    )

    // Role selector visible
    expect(screen.getByRole('combobox', { name: /role/i })).toBeDefined()
    // Deploy solo option present (canDeploySolo=true)
    expect(screen.queryByText(/deploy solo/i)).toBeTruthy()
  })

  it('does not show "Deploy solo" option when can_deploy_solo is false', () => {
    vi.mocked(trpc.listV2.eligibleBodyguards.useQuery).mockReturnValue({
      data: [{ id: 'lu-bg', datasheetId: 'ds-intercessors', points: 90, isWarlord: false, attachedToUnitId: null, attachRole: null, enhancementId: null, listId: 'list-1', loadouts: [] }],
      isLoading: false,
    } as any)
    vi.mocked(trpc.listV2.canDeploySolo.useQuery).mockReturnValue({
      data: { canDeploySolo: false },
      isLoading: false,
    } as any)

    render(
      <AttachmentPicker
        listId="list-1"
        unit={{ id: 'lu-so', datasheetId: 'ds-support-only', points: 90, isWarlord: false, attachedToUnitId: null, attachRole: null, enhancementId: null, listId: 'list-1', loadouts: [] }}
        getBodyguardName={(datasheetId) => datasheetId ?? 'unknown'}
        onAttach={vi.fn()}
      />
    )

    expect(screen.queryByText(/deploy solo/i)).toBeNull()
  })

  it('shows currently attached unit as selected', () => {
    vi.mocked(trpc.listV2.eligibleBodyguards.useQuery).mockReturnValue({
      data: [{ id: 'lu-bg', datasheetId: 'ds-intercessors', points: 90, isWarlord: false, attachedToUnitId: null, attachRole: null, enhancementId: null, listId: 'list-1', loadouts: [] }],
      isLoading: false,
    } as any)
    vi.mocked(trpc.listV2.canDeploySolo.useQuery).mockReturnValue({
      data: { canDeploySolo: true },
      isLoading: false,
    } as any)

    render(
      <AttachmentPicker
        listId="list-1"
        unit={{ id: 'lu-captain', datasheetId: 'ds-captain', points: 90, isWarlord: false, attachedToUnitId: 'lu-bg', attachRole: 'leader', enhancementId: null, listId: 'list-1', loadouts: [] }}
        getBodyguardName={(datasheetId) => datasheetId === 'ds-intercessors' ? 'Intercessors' : 'unknown'}
        onAttach={vi.fn()}
      />
    )

    // Verify the select shows the attached bodyguard
    const select = screen.getByRole('combobox', { name: /attach to/i }) as HTMLSelectElement
    expect(select.value).toBe('lu-bg')
  })
})
```

- [ ] Write the test file.
- [ ] Run it to confirm failure (component doesn't exist yet):

```bash
cd apps/list-builder/client && pnpm test -- AttachmentPicker
```

### Step 3: Implement `AttachmentPicker` component

Add the component as a **named export** in `UnitSelectionScreen.tsx` (so it is directly importable in tests). Place it between the `EnhancementPicker` and `UnitStatLine` components:

```typescript
/**
 * AttachmentPicker — shown on CHARACTER units.
 *
 * Displays a role selector (Leader / Support) and a bodyguard picker populated
 * from listV2.eligibleBodyguards (server-side, data-driven). Includes a
 * "Deploy solo" option unless can_deploy_solo=false.
 *
 * All data comes from server queries — no hardcoded character or bodyguard lists.
 */
export function AttachmentPicker({
  listId,
  unit,
  getBodyguardName,
  onAttach,
}: {
  listId: string
  unit: ListUnitV2
  /** Resolves a datasheetId to a display name (from catalog). */
  getBodyguardName: (datasheetId: string | null) => string
  onAttach: (attachedToUnitId: string | null, attachRole: 'leader' | 'support' | null) => void
}) {
  const [role, setRole] = useState<'leader' | 'support'>('leader')

  const { data: eligibleUnits = [] } = trpc.listV2.eligibleBodyguards.useQuery(
    { listId, datasheetId: unit.datasheetId!, role },
    { enabled: !!unit.datasheetId },
  )
  const { data: soloData } = trpc.listV2.canDeploySolo.useQuery(
    { datasheetId: unit.datasheetId! },
    { enabled: !!unit.datasheetId },
  )
  const canDeploySolo = soloData?.canDeploySolo ?? true

  // Determine current attachment state for this role
  const currentAttachId =
    unit.attachRole === role ? (unit.attachedToUnitId ?? '') : ''

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    if (val === '__solo__') {
      onAttach(null, null)
    } else {
      onAttach(val, role)
    }
  }

  return (
    <div className="flex items-center gap-1 flex-wrap mt-1">
      {/* Role selector */}
      <select
        aria-label="role"
        value={role}
        onChange={(e) => setRole(e.target.value as 'leader' | 'support')}
        className="text-xs px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 focus:outline-none focus:border-amber-400"
      >
        <option value="leader">Leader</option>
        <option value="support">Support</option>
      </select>
      {/* Bodyguard picker */}
      <select
        aria-label="Attach to"
        value={currentAttachId}
        onChange={handleSelect}
        className="text-xs px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 focus:outline-none focus:border-amber-400"
      >
        {canDeploySolo && <option value="">Deploy solo</option>}
        {eligibleUnits.map((bg) => (
          <option key={bg.id} value={bg.id}>
            {getBodyguardName(bg.datasheetId)}
          </option>
        ))}
      </select>
    </div>
  )
}
```

### Step 4: Wire `AttachmentPicker` into `UnitRow`

In `UnitRow`, add a `onSetAttachment` prop and render `AttachmentPicker` for CHARACTER units:

```typescript
function UnitRow({
  unit,
  listId,
  detachmentId,
  ratingMap,
  onRemove,
  onToggleWarlord,
  onSetEnhancement,
  onSetAttachment,
  getBodyguardName,
}: {
  unit: ListUnitV2
  listId: string
  detachmentId: string
  ratingMap: Map<string, string>
  onRemove: () => void
  onToggleWarlord: () => void
  onSetEnhancement: (enhId: string | undefined) => void
  onSetAttachment: (attachedToUnitId: string | null, attachRole: 'leader' | 'support' | null) => void
  getBodyguardName: (datasheetId: string | null) => string
}) {
  const datasheetId = unit.datasheetId ?? ''
  // ... existing code ...
  const isCharacter = useIsCharacter(datasheetId)

  return (
    <div ...>
      <div ...>
        {/* ... existing content ... */}
        <div className="flex items-center gap-1 ml-2">
          <WarlordButton ... />
          <EnhancementPicker ... />
          {isCharacter && (
            <AttachmentPicker
              listId={listId}
              unit={unit}
              getBodyguardName={getBodyguardName}
              onAttach={onSetAttachment}
            />
          )}
          <button onClick={onRemove} ...>X</button>
        </div>
      </div>
    </div>
  )
}
```

Add `handleSetAttachment` to the `UnitSelectionScreen` main component:

```typescript
async function handleSetAttachment(
  unit: ListUnitV2,
  attachedToUnitId: string | null,
  attachRole: 'leader' | 'support' | null,
) {
  if (!activeList) return
  await updateUnitV2Imperative({ id: unit.id, attachedToUnitId, attachRole })
  invalidateLists()
}
```

Wire into `MyArmyView`'s `UnitRow` call.

### Step 5: Verify client tests

```bash
cd apps/list-builder/client && pnpm test
```

Expected: all tests pass.

- [ ] Run type check:

```bash
cd apps/list-builder/client && npx tsc --noEmit
```

- [ ] Commit:

```bash
git add apps/list-builder/client/src/lib/useListsV2.ts apps/list-builder/client/src/components/UnitSelectionScreen.tsx apps/list-builder/client/src/components/AttachmentPicker.test.tsx
git commit -m "feat(list-builder): AttachmentPicker component — role-aware attachment UI for CHARACTER units

AttachmentPicker shows a Leader/Support role selector and a bodyguard
dropdown populated from listV2.eligibleBodyguards (server-side, data-driven).
'Deploy solo' option present unless can_deploy_solo=false.

Rendered in UnitRow for CHARACTER units only (driven by keyword lookup, not
hardcoded character list). All attachment data comes from server queries —
no client-side hardcoding of eligible bodyguards or which units are characters.

Adds useEligibleBodyguards + useCanDeploySolo hooks; eligibleBodyguardsImperative
helper. 3 new client tests for AttachmentPicker."
```

---

## Task 6: Playwright e2e spec

**Files:**
- Create: `e2e/specs/list-builder-support.spec.ts`

### Note on Playwright scope

The Playwright e2e tests require a running prod (or local) deployment with real `content_can_lead` data that includes `role` rows. Until the prod DB is migrated and new rows ingested, these tests will only be runnable after migration.

Write the spec now so it is ready. Mark it appropriately.

```typescript
import { expect, test } from '@playwright/test'

// These tests run against the deployed list-builder app (authed project).
// They require:
//   1. Migration 0012 applied to prod (role column in content_can_lead).
//   2. At least one content_can_lead row with role='leader' (existing 1811 rows
//      are backfilled via migration default).
//   3. A leader character datasheet and its eligible bodyguard datasheet exist
//      in the user's ImportedDB (synced via data-import).
//
// Until prod migration is applied, these tests will time-out on attach steps.
// Run with: cd e2e && BASE_URL=https://tabletop-tools.net pnpm test -- list-builder-support

test.describe('list-builder Support attachment (authed)', () => {
  test.skip(
    !process.env['TEST_ATTACHMENT_DATA'],
    'Skipped until content_can_lead role data is in prod and game data imported. Set TEST_ATTACHMENT_DATA=1 to run.',
  )

  test('can attach a leader character to an eligible bodyguard unit', async ({ page }) => {
    await page.goto('/list-builder/')
    await page.waitForLoadState('networkidle')

    // Create a list
    const createRes = await page.evaluate(async () => {
      const res = await fetch('/trpc/listV2.create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Support E2E', edition: '11th', battleSize: 'Strike Force' }),
      })
      return res.json() as Promise<{ result?: { data?: { id?: string } } }>
    })
    const listId = createRes.result?.data?.id
    expect(listId).toBeDefined()

    // Add a bodyguard unit (Intercessors — well-known eligible bodyguard)
    const addBgRes = await page.evaluate(async (lId: string) => {
      const res = await fetch('/trpc/listV2.addUnit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listId: lId, datasheetId: 'intercessors', points: 80, isWarlord: false }),
      })
      return res.json() as Promise<{ result?: { data?: { id?: string } } }>
    }, listId!)
    const bgUnitId = addBgRes.result?.data?.id
    expect(bgUnitId).toBeDefined()

    // Add a leader character (Captain — known leader)
    const addCapRes = await page.evaluate(async (lId: string) => {
      const res = await fetch('/trpc/listV2.addUnit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listId: lId, datasheetId: 'captain', points: 75, isWarlord: false }),
      })
      return res.json() as Promise<{ result?: { data?: { id?: string } } }>
    }, listId!)
    const capUnitId = addCapRes.result?.data?.id
    expect(capUnitId).toBeDefined()

    // Query eligible bodyguards for role=leader
    const eligRes = await page.evaluate(
      async ({ lId, dsId }: { lId: string; dsId: string }) => {
        const res = await fetch(
          `/trpc/listV2.eligibleBodyguards?input=${encodeURIComponent(JSON.stringify({ listId: lId, datasheetId: dsId, role: 'leader' }))}`,
          { credentials: 'include' },
        )
        return res.json() as Promise<{ result?: { data?: Array<{ id: string }> } }>
      },
      { lId: listId!, dsId: 'captain' },
    )
    expect(eligRes.result?.data?.map(u => u.id)).toContain(bgUnitId)

    // Attach captain as leader
    const attachRes = await page.evaluate(
      async ({ capId, bgId }: { capId: string; bgId: string }) => {
        const res = await fetch('/trpc/listV2.updateUnit', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: capId, attachedToUnitId: bgId, attachRole: 'leader' }),
        })
        return res.json() as Promise<{ result?: { data?: { success?: boolean } } }>
      },
      { capId: capUnitId!, bgId: bgUnitId! },
    )
    expect(attachRes.result?.data?.success).toBe(true)

    // Retrieve and verify
    const getRes = await page.evaluate(async (lId: string) => {
      const res = await fetch(
        `/trpc/listV2.get?input=${encodeURIComponent(JSON.stringify({ id: lId }))}`,
        { credentials: 'include' },
      )
      return res.json() as Promise<{
        result?: {
          data?: {
            units?: Array<{ id: string; attachedToUnitId: string | null; attachRole: string | null }>
          }
        }
      }>
    }, listId!)
    const units = getRes.result?.data?.units ?? []
    const captain = units.find(u => u.id === capUnitId)
    expect(captain?.attachedToUnitId).toBe(bgUnitId)
    expect(captain?.attachRole).toBe('leader')

    // Clean up
    await page.evaluate(async (lId: string) => {
      await fetch('/trpc/listV2.delete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lId }),
      })
    }, listId!)
  })

  test('rejects attaching a character in wrong role (no matching row)', async ({ page }) => {
    await page.goto('/list-builder/')
    await page.waitForLoadState('networkidle')

    const createRes = await page.evaluate(async () => {
      const res = await fetch('/trpc/listV2.create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Role Reject E2E', edition: '11th', battleSize: 'Strike Force' }),
      })
      return res.json() as Promise<{ result?: { data?: { id?: string } } }>
    })
    const listId = createRes.result?.data?.id!

    // Add bodyguard and try a support attach for a leader-only character
    const addBgRes = await page.evaluate(async (lId: string) => {
      const res = await fetch('/trpc/listV2.addUnit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listId: lId, datasheetId: 'intercessors', points: 80, isWarlord: false }),
      })
      return res.json() as Promise<{ result?: { data?: { id?: string } } }>
    }, listId)
    const bgUnitId = addBgRes.result?.data?.id!

    const addCapRes = await page.evaluate(async (lId: string) => {
      const res = await fetch('/trpc/listV2.addUnit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listId: lId, datasheetId: 'captain', points: 75, isWarlord: false }),
      })
      return res.json() as Promise<{ result?: { data?: { id?: string } } }>
    }, listId)
    const capUnitId = addCapRes.result?.data?.id!

    // Attempt to attach Captain as Support (no support row for Captain → reject)
    const rejectRes = await page.evaluate(
      async ({ capId, bgId }: { capId: string; bgId: string }) => {
        const res = await fetch('/trpc/listV2.updateUnit', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: capId, attachedToUnitId: bgId, attachRole: 'support' }),
        })
        return { status: res.status, body: await res.json() }
      },
      { capId: capUnitId, bgId: bgUnitId },
    )
    // tRPC BAD_REQUEST surfaces as HTTP 400
    expect(rejectRes.status).toBe(400)

    // Clean up
    await page.evaluate(async (lId: string) => {
      await fetch('/trpc/listV2.delete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lId }),
      })
    }, listId)
  })
})
```

- [ ] Write the spec file.
- [ ] Verify it type-checks:

```bash
cd e2e && npx tsc --noEmit
```

- [ ] Commit:

```bash
git add e2e/specs/list-builder-support.spec.ts
git commit -m "test(e2e): list-builder-support spec — leader/support attach flow + rejection

Spec is gated behind TEST_ATTACHMENT_DATA=1 env var until prod migration +
data-import are applied (content_can_lead role data must exist in prod).
Two tests: (1) full leader-attach flow with verification, (2) wrong-role
attach attempt returns HTTP 400."
```

---

## Task 7: Worklist update

**Files:**
- Modify: `docs/superpowers/plans/2026-05-29-data-layer-worklist.md`

### Step 1: Add support-mechanics row + data-gap notes

Append a new section **after** the existing worklist table:

```markdown
---

## Phase 2 follow-up — 11th-ed Support mechanics

| # | Step | Status | Notes |
|---|------|--------|-------|
| S1 | Schema: add `role` column to `content_can_lead` (PK includes role), add `can_deploy_solo` to `content_entity` | ✅ done | Migration 0012. 1811 existing rows backfilled as role='leader'. can_deploy_solo defaults true (no data change). |
| S2 | Producer: `produceCanLead` role-aware; `produceCanSupport` scaffold wired into `runSync` | ✅ done | Scaffold produces 0 rows — data gap (see below). |
| S3 | Server: `updateUnit` role-aware query; `can_deploy_solo` solo-check; `eligibleBodyguards` + `canDeploySolo` procedures | ✅ done | 6 new server tests. |
| S4 | Client: `AttachmentPicker` component in `UnitRow` for CHARACTER units | ✅ done | Data-driven: no hardcoded character lists. 3 client tests. |
| S5 | Playwright e2e spec (`list-builder-support.spec.ts`) | ✅ done | Gated behind `TEST_ATTACHMENT_DATA=1` until prod migration + data sync. |

### Data-gap acknowledgement

- **`can_support` rows: 0.** The 11th-leak `reference.md` (§19.01, §24.34) confirms the Support ability exists but contains no per-character Support attachment lists. `produceCanSupport` is wired and correct but produces 0 rows until a per-codex 11th-ed source is provided. The Wahapedia `leader_attachments` CSV is 10th-ed Leader data only.

- **"Support-only cannot deploy solo"** (`can_deploy_solo=false`): plausible from rules context but no specific characters have been identified in the ingested data. `can_deploy_solo` defaults to `true` on all existing rows. When per-codex 11th-ed data lands, specific characters will be flagged.

### TODO

| # | Step | Status | Notes |
|---|------|--------|-------|
| T1 | Deeper 11th-doc ingestion — per-codex character Support attachment lists | ⬜ todo | Needed to populate `can_support` rows. Source: per-faction 11th-ed codex data or a Wahapedia 11th-ed update. |
| T2 | Identify support-only characters and set `can_deploy_solo=false` | ⬜ todo | Blocked on T1 + ruling confirmation per character. |
| T3 | Apply migration 0012 to prod + re-run data-import sync | ⬜ todo | Unblocks Playwright e2e (`TEST_ATTACHMENT_DATA=1`). |
```

- [ ] Apply the worklist update.
- [ ] Commit:

```bash
git add docs/superpowers/plans/2026-05-29-data-layer-worklist.md
git commit -m "docs: worklist — 11th-ed Support mechanics complete, data-gap acknowledged

Phase 2 follow-up rows S1–S5 marked done. Explicit data-gap note: can_support
rows = 0 (no per-codex 11th-ed source yet). can_deploy_solo defaults true.
TODO rows T1–T3 for future ingestion work."
```

---

## Task 8: Full pre-commit check

Run all affected test suites and type-check:

```bash
# Schema package
cd C:/R/tabletop-tools/packages/db && pnpm test

# data-import server
cd C:/R/tabletop-tools/apps/data-import/server && pnpm test

# list-builder server
cd C:/R/tabletop-tools/apps/list-builder/server && pnpm test

# list-builder client
cd C:/R/tabletop-tools/apps/list-builder/client && pnpm test

# type check
cd C:/R/tabletop-tools && pnpm -r typecheck
```

Expected: all tests pass, tsc clean.

- [ ] If any test or type error appears, fix it before proceeding.
- [ ] Run the pre-commit hook (or manually run prettier + eslint):

```bash
cd C:/R/tabletop-tools && npx prettier --check "apps/list-builder/**/*.{ts,tsx}" "packages/db/src/**/*.ts" "apps/data-import/server/src/lib/content-producer.ts"
```

Fix any formatting issues with:

```bash
npx prettier --write "apps/list-builder/**/*.{ts,tsx}" "packages/db/src/**/*.ts" "apps/data-import/server/src/lib/content-producer.ts"
```

- [ ] Final commit if there were formatting fixes:

```bash
git add -p  # review and stage only formatting changes
git commit -m "style: prettier formatting pass — support attachment files"
```

---

## Summary

After completing all tasks, the gap is closed as follows:

| Gap | Status |
|---|---|
| `content_can_lead` not role-aware | Closed: role in PK, every query filtered by role |
| No `can_support` data | Acknowledged: scaffold wired, 0 rows until per-codex source |
| `updateUnit` no role filter | Closed: role-filtered query |
| No `can_deploy_solo` flag | Closed: column added, defaults true |
| No UI for attachment | Closed: `AttachmentPicker` data-driven from server |
| Dead `validateAttachment` helper | Removed: `list-attachment.ts` deleted |
| No tests for role semantics | Closed: 6 server + 3 client + Playwright spec |
