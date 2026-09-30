# Release & Publishing

Silvery uses two GitHub Actions workflows for releases:

- `verify.yml` — runs on every push to `main` and every PR. Pre-publish gate.
- `release.yml` — runs on tag push (`v*`). Publishes to npm + GitHub Release.

Both run the `verify-publishable` revision pinned in `package.json` and `bun.lock`.

## Pre-publish gate (verify-publishable)

Pre-publish bugs are expensive — once a broken `silvery@0.19.X` reaches the npm registry it is forever-pinned in users' lockfiles. The gate catches three classes of bug _before_ the tag push:

1. **Wrong `publishConfig.exports`** — the `exports` field reachable from a published tarball does not actually map to a file in `dist/`. Silvery 0.19.0 shipped this way; consumers got `Cannot find module ./src/index.ts`.
2. **Empty tarball / missing dist** — `tsdown` crashed silently or ran from the wrong cwd; the package ships without its build output.
3. **EPRIVATE on accidentally-listed public package** — a package that is supposed to publish (e.g. `@silvery/color`) still has `private: true` in `package.json`. `npm publish` would refuse, halting the release midway.

The gate builds all workspaces, packs their exact tarballs, checks packed manifest targets, Publint and ATTW, then publishes them to an isolated local registry. It installs each of the ten public packages into a fresh Node 24 consumer and probes their imports and bins. The `verifyPublishable.public` list in `package.json` asserts the release set.

The legacy verify workflow ran `npm install <packed-tarball.tgz>` directly, which always failed during release windows because the tarball's transitive deps reference `@silvery/<dep>@<thisversion>` that wasn't on the public registry yet (chicken-and-egg). Verdaccio breaks the loop by hosting every cross-dep itself.

## Run locally

```bash
bun run verify-publishable
```

This runs the pinned local binary. It builds first, then runs the local registry and fresh-consumer checks.

Useful flags:

- `--no-build` — use artifacts already built from this checkout.
- `--keep` — retain the verifier's scratch directory for inspection.
- `--output-dir <empty-dir>` — retain verified tarballs and their SHA-512 digests for a publisher.

The gate normally takes 1-2 minutes (build dominates; the verdaccio cycle is ~30s).

## What gets probed

The package manifest asserts these public names:

- `@silvery/ansi`
- `@silvery/color`
- `@silvery/command`
- `@silvery/commander`
- `@silvery/config`
- `@silvery/scope`
- `@silvery/selection`
- `@silvery/signals`
- `@silvery/syntax`
- `silvery` (root barrel)

Private workspaces are published only to the isolated registry so internal dependencies resolve. They are not consumer-probed. To add a public package, update `verifyPublishable.public` and the release workflow in the same change.

## Adding a public package

1. Create the package under `packages/<name>/` with `tsdown` build + `publishConfig.exports`.
2. Add its exact npm name to `verifyPublishable.public` in the root `package.json`.
3. Add a publish step to `release.yml` in the right dependency-order layer.
4. Run `bun run verify-publishable` locally to confirm the gate is happy.

## Release flow

Once `verify-publishable` is green on `main`:

1. Bump `version` in every workspace `package.json` (keep them in lockstep — `release.yml` publishes in dependency order).
2. Commit + tag: `git tag v<version> && git push --tags`.
3. `release.yml` runs: build → verify-publishable gate → publish in dep order → smoke test → GitHub Release.

If the gate fails on a release tag, no packages reach npm — fix the issue, retag.
