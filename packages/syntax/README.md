# @silvery/syntax

Syntax highlighting for [Silvery](../../README.md), backed by Shiki. Get structured tokens for your renderer or an ANSI-colored string for terminal output.

```ts
import { highlight, highlightToAnsi, languageForPath } from "@silvery/syntax"

const code = "const count = 1"
const lang = languageForPath("counter.ts") // "typescript"
const lines = await highlight(code, lang)
const ansi = await highlightToAnsi(code, lang)
```

Each `TokenLine` contains `tokens` with `text` and optional `color`, `bold`, and `italic` fields. Colors are hex strings; `highlightToAnsi` converts them to 24-bit foreground escape sequences.

**Languages and themes.** Language aliases such as `ts`, `js`, and `py` are accepted. The default language is `plain` and the default theme is `github-dark`; pass a Shiki bundled theme name as the third argument. Grammars load on demand. Unknown languages and inputs over the highlighting size or line-length bounds return plain text tokens.

**Rendering.** Await `highlight` before reading its result. Consumers that start several highlights can await `flushPendingHighlights()` before capturing a frame. The package returns text and styling data; your renderer controls layout and output.

See the [public exports](src/index.ts) for token types and helpers. The [`@silvery/syntax/bounded-cache` subpath](src/bounded-cache.ts) exposes the shared string-cache helpers used by Silvery.

**License:** [MIT](LICENSE).
