import type { Page } from 'playwright'

export interface BCPPairing {
  round: number
  table: number
  player1: { name: string; faction: string; result: 'win' | 'loss' | 'draw'; score: number }
  player2: { name: string; faction: string; result: 'win' | 'loss' | 'draw'; score: number }
}

/**
 * Parse pairings from BCP page text.
 * Text pattern per pairing:
 *   table number
 *   player 1 name
 *   player 1 faction
 *   "Win: XX" or "Loss: XX" or "Draw: XX"
 *   "View List" (optional)
 *   player 2 name
 *   player 2 faction
 *   "Win: XX" or "Loss: XX" or "Draw: XX"
 */
export function parsePairingsFromText(text: string, round: number): BCPPairing[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  const pairings: BCPPairing[] = []

  for (let i = 0; i < lines.length; i++) {
    // Look for "Win: XX" or "Loss: XX" pattern
    const resultMatch = lines[i]!.match(/^(Win|Loss|Draw):\s*(\d+)$/i)
    if (!resultMatch) continue

    // Found a result line — look backward for player name, faction, table
    const p1Result = resultMatch[1]!.toLowerCase() as 'win' | 'loss' | 'draw'
    const p1Score = parseInt(resultMatch[2]!, 10)

    // Player 1 faction is 1-2 lines before result
    let p1Faction = ''
    let p1Name = ''
    let table = 0

    for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
      const line = lines[j]!
      if (line === 'View List' || line === 'No List') continue
      if (/^(Win|Loss|Draw):/i.test(line)) break
      if (line === 'Bracket 1' || line === 'TABLE') break

      if (!p1Faction) {
        p1Faction = line
      } else if (!p1Name) {
        p1Name = line
      } else if (/^\d{1,3}$/.test(line)) {
        table = parseInt(line, 10)
        break
      }
    }

    if (!p1Name) continue

    // Now look forward for player 2
    let p2Name = ''
    let p2Faction = ''
    let p2Result: 'win' | 'loss' | 'draw' = 'loss'
    let p2Score = 0

    for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
      const line = lines[j]!
      if (line === 'View List' || line === 'No List') continue

      const p2ResultMatch = line.match(/^(Win|Loss|Draw):\s*(\d+)$/i)
      if (p2ResultMatch) {
        p2Result = p2ResultMatch[1]!.toLowerCase() as 'win' | 'loss' | 'draw'
        p2Score = parseInt(p2ResultMatch[2]!, 10)
        break
      }

      // Skip dashes (bye opponent)
      if (/^-+$/.test(line)) {
        p2Name = 'BYE'
        p2Faction = ''
        p2Result = 'loss'
        break
      }

      if (!p2Name) {
        p2Name = line
      } else if (!p2Faction) {
        p2Faction = line
      }
    }

    if (!p2Name) continue

    pairings.push({
      round,
      table,
      player1: { name: p1Name, faction: p1Faction, result: p1Result, score: p1Score },
      player2: { name: p2Name, faction: p2Faction, result: p2Result, score: p2Score },
    })

    // Skip ahead past this pairing
    i += 5
  }

  return pairings
}

/**
 * Scrape all rounds of pairings from a BCP event.
 */
export async function scrapeAllPairings(
  eventUrl: string,
  page: Page,
): Promise<BCPPairing[]> {
  const pairingsUrl = eventUrl.includes('?')
    ? `${eventUrl}&active_tab=pairings`
    : `${eventUrl}?active_tab=pairings`

  await page.goto(pairingsUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(5000)  // BCP is slow

  const allPairings: BCPPairing[] = []

  // Find current round number from page text
  const getCurrentRound = async (): Promise<number> => {
    return page.evaluate(() => {
      const text = document.body.innerText
      const match = text.match(/Round\s+(\d+)/i)
      return match ? parseInt(match[1]!) : 0
    })
  }

  const maxRound = await getCurrentRound()
  if (maxRound === 0) return []

  // Navigate to Round 1 — click the previous arrow repeatedly
  // BCP uses SVG arrow buttons, find them by position near "Round X" text
  for (let i = 0; i < maxRound; i++) {
    const prevArrow = await page.$('svg >> xpath=ancestor::button >> nth=0')
      ?? await page.locator('button').filter({ has: page.locator('svg') }).nth(-2).elementHandle()

    if (!prevArrow) {
      // Try clicking any button with < arrow near the round text
      try {
        await page.evaluate(() => {
          // Find buttons near "Round" text — the < button is before the > button
          const roundEl = Array.from(document.querySelectorAll('*')).find(el => /^Round\s+\d+$/.test(el.textContent?.trim() || ''))
          if (roundEl?.parentElement) {
            const navButtons = roundEl.parentElement.querySelectorAll('button')
            if (navButtons.length >= 1) {
              (navButtons[0] as HTMLButtonElement).click()
            }
          }
        })
        await page.waitForTimeout(800)
      } catch {
        break
      }
    } else {
      break
    }

    const current = await getCurrentRound()
    if (current <= 1) break
  }

  // Alternative approach: just use URL parameters for each round if available
  // BCP might support ?round=1 or similar

  // Scrape each round by navigating via URL
  for (let round = 1; round <= maxRound; round++) {
    // Try navigating directly to the round
    const roundUrl = `${pairingsUrl}&round=${round}`
    await page.goto(roundUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForTimeout(3000)

    // Scroll to load all pairings
    let lastText = ''
    let stable = 0
    for (let s = 0; s < 20; s++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await page.waitForTimeout(600)
      const currentText = await page.evaluate(() => document.body.innerText)
      if (currentText === lastText) {
        stable++
        if (stable >= 2) break
      } else {
        stable = 0
      }
      lastText = currentText
    }

    // Verify we're on the right round
    const currentRound = await getCurrentRound()

    // Extract pairings text
    const text = await page.evaluate(() => document.body.innerText)
    const roundPairings = parsePairingsFromText(text, currentRound || round)
    allPairings.push(...roundPairings)
  }

  return allPairings
}

/**
 * Calculate W/L/D record per player from pairings data.
 */
export function calculateRecords(
  pairings: BCPPairing[],
): Map<string, { wins: number; losses: number; draws: number }> {
  const records = new Map<string, { wins: number; losses: number; draws: number }>()

  for (const p of pairings) {
    for (const player of [p.player1, p.player2]) {
      if (player.name === 'BYE') continue
      if (!records.has(player.name)) {
        records.set(player.name, { wins: 0, losses: 0, draws: 0 })
      }
      const r = records.get(player.name)!
      if (player.result === 'win') r.wins++
      else if (player.result === 'loss') r.losses++
      else r.draws++
    }
  }

  return records
}
