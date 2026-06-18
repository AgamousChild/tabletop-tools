/**
 * Global teardown: clean up test users created during E2E runs.
 * Deletes all users with @test.local emails from the prod database.
 *
 * Requires TURSO_DB_URL and TURSO_AUTH_TOKEN env vars to connect to prod.
 * If not set, skips cleanup (local dev doesn't need it).
 */
import type { FullConfig } from '@playwright/test'

export default async function globalTeardown(_config: FullConfig) {
  const dbUrl = process.env.TURSO_DB_URL
  const dbToken = process.env.TURSO_AUTH_TOKEN

  if (!dbUrl || !dbToken) {
    console.log('[global-teardown] No TURSO credentials — skipping test user cleanup')
    return
  }

  try {
    // Use Turso HTTP API directly to avoid importing @libsql/client in Playwright context
    const response = await fetch(`${dbUrl}/v2/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${dbToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            type: 'execute',
            stmt: {
              sql: "DELETE FROM session WHERE user_id IN (SELECT id FROM user WHERE email LIKE '%@test.local')",
            },
          },
          {
            type: 'execute',
            stmt: {
              sql: "DELETE FROM user WHERE email LIKE '%@test.local'",
            },
          },
          { type: 'close' },
        ],
      }),
    })

    if (response.ok) {
      await response.json()
      console.log('[global-teardown] Cleaned up test users from prod')
    } else {
      console.warn(`[global-teardown] Cleanup failed: HTTP ${response.status}`)
    }
  } catch (err) {
    console.warn('[global-teardown] Cleanup error:', (err as Error).message)
  }
}
