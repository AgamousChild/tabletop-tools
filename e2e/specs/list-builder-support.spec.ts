import { expect, test } from '@playwright/test'

// These tests run against the deployed list-builder app (authed project).
// They require:
//   1. Migration 0012 applied to prod (role column in content_can_lead).
//   2. At least one content_can_lead row with role='leader' (existing rows
//      are backfilled via migration default).
//   3. A leader character datasheet and its eligible bodyguard datasheet exist
//      in the user's IndexedDB (synced via data-import).
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
        body: JSON.stringify({
          listId: lId,
          datasheetId: 'intercessors',
          points: 80,
          isWarlord: false,
        }),
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
    expect(eligRes.result?.data?.map((u) => u.id)).toContain(bgUnitId)

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
            units?: Array<{
              id: string
              attachedToUnitId: string | null
              attachRole: string | null
            }>
          }
        }
      }>
    }, listId!)
    const units = getRes.result?.data?.units ?? []
    const captain = units.find((u) => u.id === capUnitId)
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
        body: JSON.stringify({
          name: 'Role Reject E2E',
          edition: '11th',
          battleSize: 'Strike Force',
        }),
      })
      return res.json() as Promise<{ result?: { data?: { id?: string } } }>
    })
    const listId = createRes.result?.data?.id
    expect(listId).toBeDefined()

    // Add bodyguard and try a support attach for a leader-only character
    const addBgRes = await page.evaluate(async (lId: string) => {
      const res = await fetch('/trpc/listV2.addUnit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listId: lId,
          datasheetId: 'intercessors',
          points: 80,
          isWarlord: false,
        }),
      })
      return res.json() as Promise<{ result?: { data?: { id?: string } } }>
    }, listId as string)
    const bgUnitId = addBgRes.result?.data?.id
    expect(bgUnitId).toBeDefined()

    const addCapRes = await page.evaluate(async (lId: string) => {
      const res = await fetch('/trpc/listV2.addUnit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listId: lId, datasheetId: 'captain', points: 75, isWarlord: false }),
      })
      return res.json() as Promise<{ result?: { data?: { id?: string } } }>
    }, listId as string)
    const capUnitId = addCapRes.result?.data?.id
    expect(capUnitId).toBeDefined()

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
      { capId: capUnitId as string, bgId: bgUnitId as string },
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
    }, listId as string)
  })
})
