# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Auth flow >> invalid credentials show error
- Location: specs\auth.spec.ts:68:7

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/no-cheat/
Call log:
  - navigating to "http://localhost:5173/no-cheat/", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | import { signUp, logIn, logOut, testEmail } from '../fixtures/auth'
  3  | 
  4  | // Auth Worker uses scrypt (CPU-intensive) — increase default timeout for these tests
  5  | test.describe('Auth flow', () => {
  6  |   test('shows register form on auth-gated app', async ({ page }) => {
  7  |     await page.goto('/no-cheat/')
  8  |     await page.waitForLoadState('networkidle')
  9  | 
  10 |     // Should show auth screen with login form by default
  11 |     await expect(page.getByPlaceholder('Email')).toBeVisible()
  12 |     await expect(page.getByPlaceholder('Password')).toBeVisible()
  13 |     await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  14 | 
  15 |     // Switch to register mode
  16 |     await page.getByRole('button', { name: 'Register' }).click()
  17 |     await expect(page.getByPlaceholder('Name')).toBeVisible()
  18 |     await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()
  19 |   })
  20 | 
  21 |   test('can register with email/password/name', async ({ page }) => {
  22 |     const email = testEmail()
  23 |     await page.goto('/no-cheat/')
  24 |     await page.waitForLoadState('networkidle')
  25 | 
  26 |     await signUp(page, { email, password: 'TestPassword123!', name: 'Auth Test User' })
  27 | 
  28 |     // After register, main app content should be visible (auth gate passed)
  29 |     await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 30_000 })
  30 |   })
  31 | 
  32 |   test('can log out and return to auth screen', async ({ page }) => {
  33 |     const email = testEmail()
  34 |     await page.goto('/no-cheat/')
  35 |     await page.waitForLoadState('networkidle')
  36 | 
  37 |     // Register first
  38 |     await signUp(page, { email, password: 'TestPassword123!', name: 'Logout Test' })
  39 |     await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 30_000 })
  40 | 
  41 |     // Log out
  42 |     await logOut(page)
  43 | 
  44 |     // Should return to auth screen
  45 |     await expect(page.getByPlaceholder('Email')).toBeVisible({ timeout: 10_000 })
  46 |   })
  47 | 
  48 |   test('can log back in with same credentials', async ({ page }) => {
  49 |     const email = testEmail()
  50 |     const password = 'TestPassword123!'
  51 | 
  52 |     await page.goto('/no-cheat/')
  53 |     await page.waitForLoadState('networkidle')
  54 | 
  55 |     // Register
  56 |     await signUp(page, { email, password, name: 'ReLogin Test' })
  57 |     await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 30_000 })
  58 | 
  59 |     // Log out
  60 |     await logOut(page)
  61 |     await expect(page.getByPlaceholder('Email')).toBeVisible({ timeout: 10_000 })
  62 | 
  63 |     // Log back in
  64 |     await logIn(page, { email, password })
  65 |     await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 30_000 })
  66 |   })
  67 | 
  68 |   test('invalid credentials show error', async ({ page }) => {
> 69 |     await page.goto('/no-cheat/')
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/no-cheat/
  70 |     await page.waitForLoadState('networkidle')
  71 | 
  72 |     await logIn(page, { email: 'nonexistent@test.local', password: 'WrongPassword!' })
  73 | 
  74 |     // Should show an error message
  75 |     await expect(page.locator('.text-red-400')).toBeVisible({ timeout: 10_000 })
  76 |   })
  77 | })
  78 | 
```