# apps/data-import/server/src/lib/parsers/wahapedia-csv.ts

> Pipe-delimited CSV parser and HTML-to-markdown converter for Wahapedia data.

## Prompt

Four exported utility functions for processing Wahapedia's data format:

**`parsePipeCsv<T>(raw: string): T[]`** — parse pipe-delimited CSV. First line is headers, subsequent lines are data, delimiter is `|`. Split on newlines, filter empty lines. First line becomes header array (trimmed). Each subsequent line becomes an object with header keys and trimmed string values. Return typed array.

**`stripHtml(html: string): string`** — basic HTML stripping: convert `<br>` to newlines, strip all tags, decode HTML entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`, `&nbsp;`), trim.

**`htmlToMarkdown(html: string): string`** — convert Wahapedia's specific HTML patterns to markdown. Handle (in order): `<br>` → newline, `<b>` → `**bold**`, `<i>`/`<em>` → `*italic*`, `<span class="kwb">` → `**bold**` (keyword bold), plain `<span>` → unwrap, `</p>` → newline, `<li>` → `- ` prefix, `</td>`/`</th>` → space, `</tr>` → newline, strip remaining tags, decode entities, collapse triple+ newlines to double. Short-circuit if input has no `<` character.

**`titleCase(s: string): string`** — normalize curly/prime apostrophes, lowercase, then capitalize first letter of each word.

**`convertDescriptions(rows, field='description'): Record<string, unknown>[]`** — apply `htmlToMarkdown` to a specific field across all rows. Non-string values left unchanged.

## Dependencies

None (pure functions).
