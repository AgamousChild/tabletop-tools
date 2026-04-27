/**
 * Scrape pairings for a single BCP event.
 * Designed to be called from the Playwright MCP browser_run_code tool.
 *
 * Returns the JavaScript code string to pass to browser_run_code.
 */

export function generateScrapeCode(eventId: string, maxRounds: number = 10): string {
  return `async (page) => {
  const allPairings = [];
  let maxRound = 0;

  // Load round 1 to detect max rounds
  await page.goto('https://www.bestcoastpairings.com/event/${eventId}?active_tab=pairings&round=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Get current max round by checking if next button exists
  for (let probe = 1; probe <= ${maxRounds}; probe++) {
    const roundText = await page.evaluate(() => {
      const m = document.body.innerText.match(/Round\\s+(\\d+)/);
      return m ? parseInt(m[1]) : 0;
    });
    if (roundText > maxRound) maxRound = roundText;

    // Try next round
    const nextBtn = await page.$('button[aria-label="next"]:not([disabled]), button:has-text("next"):not([disabled])');
    if (!nextBtn) break;
    await nextBtn.click();
    await page.waitForTimeout(1000);
  }

  // Now scrape each round via URL
  for (let round = 1; round <= maxRound; round++) {
    await page.goto('https://www.bestcoastpairings.com/event/${eventId}?active_tab=pairings&round=' + round, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const pairings = await page.evaluate((r) => {
      const links = document.querySelectorAll('a[href*="/game/pairing/"]');
      const res = [];
      links.forEach(link => {
        const ps = Array.from(link.querySelectorAll('p')).map(p => p.textContent?.trim() || '');
        const lLinks = Array.from(link.querySelectorAll('a[href*="/list/"]')).map(a => a.href);
        const filtered = ps.filter(p => p && p !== 'View List' && p !== 'No List');
        if (filtered.length >= 4) {
          const r1 = filtered[3]?.match(/(Win|Loss|Draw):\\s*(\\d+)/i);
          const r2 = filtered.length >= 7 ? filtered[6]?.match(/(Win|Loss|Draw):\\s*(\\d+)/i) : null;
          if (r1) {
            res.push({
              round: r,
              table: parseInt(filtered[0]) || 0,
              p1: { name: filtered[1], faction: filtered[2], result: r1[1].toLowerCase(), score: parseInt(r1[2]), listUrl: lLinks[0] || null },
              p2: { name: filtered[4] || 'BYE', faction: filtered[5] || '', result: r2 ? r2[1].toLowerCase() : 'loss', score: r2 ? parseInt(r2[2]) : 0, listUrl: lLinks[1] || null }
            });
          }
        }
      });
      return res;
    }, round);

    allPairings.push(...pairings);
  }

  // Calculate records
  const records = {};
  allPairings.forEach(p => {
    for (const pl of [p.p1, p.p2]) {
      if (!pl.name || pl.name === 'BYE' || pl.name.includes('---')) continue;
      if (!records[pl.name]) records[pl.name] = { w: 0, l: 0, d: 0, faction: pl.faction, listUrl: pl.listUrl };
      if (pl.result === 'win') records[pl.name].w++;
      else if (pl.result === 'loss') records[pl.name].l++;
      else records[pl.name].d++;
      records[pl.name].faction = pl.faction;
      if (pl.listUrl) records[pl.name].listUrl = pl.listUrl;
    }
  });

  return JSON.stringify({
    eventId: '${eventId}',
    pairings: allPairings.length,
    rounds: maxRound,
    players: Object.keys(records).length,
    records
  });
}`
}
