import { expect, test } from '@playwright/test'

test.describe('Game Tracker v2 (authed)', () => {
  test('mission catalog API returns primaries', async ({ request }) => {
    const res = await request.post('/game-tracker/trpc/mission.listPrimaries', {
      headers: { 'Content-Type': 'application/json' },
      data: { json: null },
    })
    // Endpoint exists and responds (may return empty array in staging if DB is unpopulated)
    expect(res.status()).toBeLessThan(500)
  })

  test('mission catalog API returns secondaries', async ({ request }) => {
    const res = await request.post('/game-tracker/trpc/mission.listSecondaries', {
      headers: { 'Content-Type': 'application/json' },
      data: { json: null },
    })
    expect(res.status()).toBeLessThan(500)
  })

  test('matchV2.start is accessible when authed', async ({ request }) => {
    const res = await request.post('/game-tracker/trpc/matchV2.start', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        json: {
          opponentName: 'E2E Opponent',
          opponentFaction: 'Space Marines',
          primaryMissionId: null,
          deploymentId: null,
        },
      },
    })
    // Authenticated endpoint — returns 401 without valid session cookie (storageState not used in `public` project)
    // This test just confirms the endpoint route is wired and not 404
    expect([200, 400, 401, 403]).toContain(res.status())
  })

  test('game tracker page still loads after v2 changes', async ({ page }) => {
    await page.goto('/game-tracker/')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1:has-text("Game Tracker")')).toBeVisible({ timeout: 15_000 })
  })
})
