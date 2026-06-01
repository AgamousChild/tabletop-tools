import { expect, test } from '@playwright/test'

// These tests run against the live dev/prod server (list-builder).
// They use the 'authed' project's auth fixture and exercise the listV2 tRPC API
// directly via fetch from the browser context (cookies are already set by the fixture).

test.describe('listV2 API (Phase 2 relational model)', () => {
  test('create a list, add a unit, retrieve it, then clean up', async ({ page }) => {
    // Navigate to list-builder to establish the auth cookies in this context
    await page.goto('/list-builder/')
    await page.waitForLoadState('networkidle')

    // Create a list via tRPC HTTP API
    const createRes = await page.evaluate(async () => {
      const res = await fetch('/trpc/listV2.create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'E2E Test List',
          edition: '11th',
          battleSize: 'Strike Force',
        }),
      })
      return res.json() as Promise<{ result?: { data?: { id?: string } } }>
    })

    expect(createRes.result?.data?.id).toBeDefined()
    const listId = createRes.result!.data!.id as string

    // Add a unit
    const addRes = await page.evaluate(async (lId: string) => {
      const res = await fetch('/trpc/listV2.addUnit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listId: lId, points: 90, isWarlord: false }),
      })
      return res.json() as Promise<{ result?: { data?: { id?: string } } }>
    }, listId)

    expect(addRes.result?.data?.id).toBeDefined()

    // Retrieve the list
    const getRes = await page.evaluate(async (lId: string) => {
      const res = await fetch(
        `/trpc/listV2.get?input=${encodeURIComponent(JSON.stringify({ id: lId }))}`,
        {
          credentials: 'include',
        },
      )
      return res.json() as Promise<{
        result?: { data?: { units?: Array<{ points: number }> } }
      }>
    }, listId)

    expect(getRes.result?.data?.units).toHaveLength(1)
    expect(getRes.result?.data?.units?.[0]?.points).toBe(90)

    // Clean up — delete the list
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
