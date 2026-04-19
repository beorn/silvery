# Content

Data files consumed at build-time by [`@bearly/vitepress-enrich`](https://github.com/beorn/bearly) to power auto-linking, tooltips, and build-time validation on silvery.dev.

## `glossary.json`

The **public glossary** for silvery.dev. Each entry becomes an auto-linked term and hover tooltip across the site.

**Shape:**

```json
[
  { "term": "SelectList", "href": "/api/select-list", "tooltip": "Interactive list component" },
  { "term": "SGR", "tooltip": "Select Graphic Rendition — controls text styling" },
  {
    "term": "Termless",
    "href": "https://termless.dev",
    "tooltip": "Headless terminal testing",
    "external": true
  }
]
```

- `term` — the word that gets auto-linked
- `href` — destination URL (local `/path` or absolute `https://...`)
- `tooltip` — hover text
- `external` — if `true`, link opens a new tab with an external-link icon

**Edit here, not elsewhere.** This file is the single source of truth — the VitePress config imports it directly (`import siteGlossary from "../content/glossary.json"`), and `@bearly/vitepress-enrich` auto-links matches across all markdown pages on build.

**Sibling sites** (termless.dev, terminfo.dev) maintain their own `docs/content/glossary.json` files with the same shape. Cross-site linking happens via `loadEcosystemGlossary()` in the VitePress config.

See [`@bearly/vitepress-enrich`](https://github.com/beorn/bearly/tree/main/packages/vitepress-enrich) for the full glossary plugin docs.
