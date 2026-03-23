# npm pack Audit

Audit of `npm pack --dry-run` output for the `silvery` root package. Last updated 2026-03-09.

## Summary

| Metric        | Value           |
| ------------- | --------------- |
| Package name  | `silvery@0.0.1` |
| Total files   | 507             |
| Unpacked size | 3.9 MB          |
| Packed size   | 1.1 MB          |

## Entry Point Resolution

All three `exports` entry points resolve to files that would be in the tarball:

| Entry Point | File                           | In Tarball? |
| ----------- | ------------------------------ | ----------- |
| `.`         | `src/index.ts`                 | Yes         |
| `./ink`     | `packages/ink/src/ink.ts`   | Yes         |
| `./chalk`   | `packages/ink/src/chalk.ts` | Yes         |

All workspace package source files are included (they live under `packages/*/src/`).

## Extraneous Files

The tarball includes files that should NOT be published:

### Must Exclude (saves ~170+ KB packed)

| Category         | Files                                                        | Size    | Issue                                           |
| ---------------- | ------------------------------------------------------------ | ------- | ----------------------------------------------- |
| Lock file        | `bun.lock`                                                   | 63.5 KB | Not useful to consumers; regenerated on install |
| CI/GitHub        | `.github/workflows/docs.yml`                                 | 1.1 KB  | CI config                                       |
| Changeset config | `.changeset/config.json`                                     | 296 B   | Release tooling internal                        |
| Lint config      | `.oxlintrc.json`                                             | 206 B   | Dev-only config                                 |
| CLAUDE.md files  | `examples/CLAUDE.md`, `packages/term/src/pipeline/CLAUDE.md` | ~41 KB  | AI assistant instructions                       |
| Scripts          | `scripts/fix-imports.ts`                                     | 9.3 KB  | Dev utility script                              |
| Test fixtures    | `tests/compat/ink/helpers/*`, `tests/fixtures/index.tsx`     | ~10 KB  | Test infrastructure                             |
| tsconfig         | `tsconfig.json`                                              | 936 B   | Workspace config (consumers have their own)     |

### Should Consider Excluding (saves ~1.5+ MB packed)

| Category                              | File Count          | Approximate Size | Issue                                            |
| ------------------------------------- | ------------------- | ---------------- | ------------------------------------------------ |
| Tests (`tests/`)                      | 35 files            | ~150+ KB         | Test files, fixtures, benchmarks, results docs   |
| Documentation (`docs/`)               | 90 files            | ~600+ KB         | Good for GitHub, not for npm. Use homepage link. |
| Examples (`examples/`)                | 76 files            | ~700+ KB         | Better served via repo link or separate package  |
| VitePress config (`docs/.vitepress/`) | Config + components | ~10 KB           | Build artifacts, not library code                |
| Images (`docs/images/`)               | 4 PNG files         | ~182 KB          | Screenshots for docs site                        |

### Already Excluded (good)

- `node_modules/` (via .gitignore)
- `dist/` (via .gitignore)
- `.DS_Store` (via .gitignore)
- `*.tsbuildinfo` (via .gitignore)
- No `.env` or credentials files found
- No test files in `src/` or `packages/` directories -- all tests are under `tests/` at root level (35 files currently leak into the tarball)

## Current .gitignore

```
node_modules/
dist/
*.tsbuildinfo
.DS_Store
editset.json
```

There is no `.npmignore` file. npm falls back to `.gitignore` for exclusion.

## Recommended .npmignore

Creating a `.npmignore` will override `.gitignore` for npm purposes. Once it exists, `.gitignore` is no longer consulted by npm -- so all gitignore exclusions must be repeated.

```
# Build artifacts
node_modules/
dist/
*.tsbuildinfo

# OS files
.DS_Store

# Development files
.changeset/
.github/
.oxlintrc.json
bun.lock
tsconfig.json
scripts/
editset.json

# Tests
tests/

# Documentation (available on GitHub/website)
docs/

# Examples (available on GitHub)
examples/

# AI assistant config
**/CLAUDE.md
```

This would reduce the tarball from ~507 files / 3.9 MB to ~250 files / ~1.8 MB (source code only).

## Alternative: Use `"files"` in package.json

A safer approach is a positive include list in `package.json`:

```json
{
  "files": ["src/", "packages/", "LICENSE", "README.md"]
}
```

This is more maintainable than `.npmignore` because it's additive: only listed paths are included. New top-level files/dirs won't accidentally leak into the tarball.

## Workspace Package Tarball Contents

Note: The workspace packages (`@silvery/ansi`, `@silvery/react`, etc.) are NOT published separately when running `npm pack` on the root. They are included as source files under `packages/*/src/`. If they are ever published independently, each needs its own `"files"` field or `.npmignore`.

## Actionable Items

1. **Create `.npmignore`** (or add `"files"` to package.json) to exclude docs, examples, tests, CI config, lock file, and CLAUDE.md files
2. **Move `storybook.ts`** from `packages/ansi/src/` to `examples/` or `scripts/` (it's an executable demo, not a library module)
3. **Consider** whether `packages/term/src/pipeline/CLAUDE.md` should exist in src/ at all (it's 36.9 KB of AI instructions that ships in the tarball)
