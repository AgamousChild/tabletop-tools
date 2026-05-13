# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: cross-app-auth.spec.ts >> Cross-app auth >> session cookie carries across apps on same origin
- Location: specs\cross-app-auth.spec.ts:5:7

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/no-cheat/
Call log:
  - navigating to "http://localhost:5173/no-cheat/", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | import { signUp, testEmail } from '../fixtures/auth'
  3  | 
  4  | test.describe('Cross-app auth', () => {
  5  |   test('session cookie carries across apps on same origin', async ({ page }) => {
  6  |     const email = testEmail()
  7  | 
  8  |     // Log in on no-cheat
> 9  |     await page.goto('/no-cheat/')
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/no-cheat/
  10 |     await page.waitForLoadState('networkidle')
  11 |     await signUp(page, { email, password: 'TestPassword123!', name: 'Cross App Test' })
  12 | 
  13 |     // Wait for auth to complete on no-cheat (scrypt hash can be slow)
  14 |     await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 30_000 })
  15 | 
  16 |     // Navigate to versus — auth gate should be bypassed (same-origin cookie)
  17 |     await page.goto('/versus/')
  18 |     await page.waitForLoadState('networkidle')
  19 | 
  20 |     // Should see the main app content, not the auth screen
  21 |     await expect(page.locator('h1:has-text("Versus")').first()).toBeVisible({ timeout: 15_000 })
  22 |     // Should NOT see the auth form
  23 |     await expect(page.getByPlaceholder('Email')).not.toBeVisible({ timeout: 5_000 })
  24 |   })
  25 | })
  26 | 
```