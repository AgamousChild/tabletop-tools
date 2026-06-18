# apps/content-ingestor/src/extract/phonetic-fix.ts

> Find and correct phonetic misspellings of 40K terms in draft content.

## Prompt

Five exports for a phonetic correction system addressing speech-to-text errors in 40K terminology:

**`loadTermDictionary(brainNodesDir)`** — load canonical 40K terms from brain community.json.

**`buildPhoneticIndex(terms)`** — Double Metaphone-inspired phonetic encoder: strips vowels/consonant clusters, builds lookup index.

**`findPhoneticMatches(text, terms, index)`** — extracts capitalized phrases and lowercase terms from text, matches against phonetic index, ranks by confidence using Levenshtein distance (>60% threshold).

**`applyPhoneticFixes(text, matches, minConfidence)`** — applies matches ≥70% confidence as string replacements.

**`scanDraftsForMismatches(draftDir, brainNodesDir)`** — batch-processes all .md draft files.

## Dependencies

- `fs`, `path`
