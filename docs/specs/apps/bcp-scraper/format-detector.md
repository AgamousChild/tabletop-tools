# apps/bcp-scraper/server/src/lib/format-detector.ts

> Detect army list text format — GW App, BattleScribe, HTML, or unknown.

## Prompt

Export `detectFormat(text: string): 'gw-app' | 'battlescribe' | 'html' | 'unknown'`.

Detection rules (checked in order):
1. **BattleScribe**: contains `+++`, `FACTION KEYWORD:`, or `+ DETACHMENT:`
2. **HTML**: contains `<div`, `<body`, `body {`, `enable JavaScript`, or starts with `<!`
3. **GW App**: matches regex `^.{0,100}\(\d[\d,]*\s*[Pp]oints?\)` — first 100 chars contain a parenthesized point value
4. **Unknown**: none of the above

Empty/blank input returns `'unknown'`.

## Dependencies

None (pure function).
