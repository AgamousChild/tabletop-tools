import { test, expect } from '@playwright/test'
import { signUp, logIn, logOut, testEmail } from '../fixtures/auth'

// Auth Worker uses scrypt (CPU-intensive) — increase default timeout for these tests
test.describe('Auth flow', () => {
  test('shows register form on auth-gated app', async ({ page }) => {
    await page.goto('/no-cheat/')
    await page.waitForLoadState('networkidle')

    // Should show auth screen with login form by default
    await expect(page.getByPlaceholder('Email')).toBeVisible()
    await expect(page.getByPlaceholder('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()

    // Switch to register mode
    await page.getByRole('button', { name: 'Register' }).click()
    await expect(page.getByPlaceholder('Name')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()
  })

  test('can register with email/password/name', async ({ page }) => {
    const email = testEmail()
    await page.goto('/no-cheat/')
    await page.waitForLoadState('networkidle')

    await signUp(page, { email, password: 'TestPassword123!', name: 'Auth Test User' })

    // After register, main app content should be visible (auth gate passed)
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 30_000 })
  })

  test('can log out and return to auth screen', async ({ page }) => {
    const email = testEmail()
    await page.goto('/no-cheat/')
    await page.waitForLoadState('networkidle')

    // Register first
    await signUp(page, { email, password: 'TestPassword123!', name: 'Logout Test' })
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 30_000 })

    // Log out
    await logOut(page)

    // Should return to auth screen
    await expect(page.getByPlaceholder('Email')).toBeVisible({ timeout: 10_000 })
  })

  test('can log back in with same credentials', async ({ page }) => {
    const email = testEmail()
    const password = 'TestPassword123!'

    await page.goto('/no-cheat/')
    await page.waitForLoadState('networkidle')

    // Register
    await signUp(page, { email, password, name: 'ReLogin Test' })
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 30_000 })

    // Log out
    await logOut(page)
    await expect(page.getByPlaceholder('Email')).toBeVisible({ timeout: 10_000 })

    // Log back in
    await logIn(page, { email, password })
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible({ timeout: 30_000 })
  })

  test('invalid credentials show error', async ({ page }) => {
    await page.goto('/no-cheat/')
    await page.waitForLoadState('networkidle')

    await logIn(page, { email: 'nonexistent@test.local', password: 'WrongPassword!' })

    // Should show an error message
    await expect(page.locator('.text-red-400')).toBeVisible({ timeout: 10_000 })
  })
})
