# Card UI Issues — Found During Testing

## Fix Now
1. ~~Invuln save not showing~~ FIXED
2. ~~Internal keywords (t5, sv3+, etc.) showing~~ FIXED
3. Feel No Pain value not displayed — verify it shows in abilities section
4. "Characters" should be "Character" (singular, match GW)
5. Faction keywords should be bottom-right, separated from regular keywords (GW format)
6. "Other" showing as a keyword — it's the role field, belongs in header not keywords
7. Browse has no pagination — shows 100 of 9552, no way to load more

## Needs Decision
- Role display: should it show in header? How to display "Other" role meaningfully?

## Verified Working
- 50/50 units open with weapons + abilities
- Open/close/open cycle works
- Invuln save displays (4++ for Abaddon, 5++ for Knights)
- Weapon ability tags highlighted correctly
- Keywords filtered (no internal junk)
