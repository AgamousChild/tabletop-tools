import type { Page } from 'playwright'

/**
 * Pure helper — normalises raw text extracted from the DOM.
 * Returns null for null input, empty strings, or whitespace-only strings.
 */
export function parseArmyListFromText(raw: string | null): string | null {
  if (raw === null) return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Scrape a player's army list from their BCP event page.
 *
 * BCP shows army lists on the player detail page, typically inside a
 * pre-formatted text block or a div with a class like "army-list".
 * Returns null if no list is found (list not submitted or not public).
 */
export async function scrapeArmyList(playerUrl: string, page: Page): Promise<string | null> {
  await page.goto(playerUrl, { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(1500)

  const rawText = await page.evaluate((): string | null => {
    // Strategy 1: dedicated army-list container
    const container = document.querySelector(
      '[class*="army-list"], [class*="armylist"], [class*="list-content"], pre',
    )
    if (container) return container.textContent ?? null

    // Strategy 2: look for a textarea (BCP sometimes renders lists in a readonly textarea)
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea')
    if (textarea?.value) return textarea.value

    // Strategy 3: look for a div labelled "Army List" and take the sibling/child text
    const labels = Array.from(document.querySelectorAll('h3, h4, h5, label, strong'))
    for (const label of labels) {
      if (/army\s*list/i.test(label.textContent ?? '')) {
        const sibling = label.nextElementSibling
        if (sibling) return sibling.textContent ?? null
      }
    }

    return null
  })

  return parseArmyListFromText(rawText)
}
