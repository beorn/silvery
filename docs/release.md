# Release & Publishing

Silvery uses two GitHub Actions workflows:

- [`verify.yml`](../.github/workflows/verify.yml) tests and builds each push to `main` and each pull request, then checks the packages with its pinned `beorn/verify-publishable` action.
- [`release.yml`](../.github/workflows/release.yml) is dispatched on `main` with the exact source commit and an ordered package/version list. It verifies and retains tarballs, then publishes those exact files through npm Trusted Publishing with provenance.

The generated workflows name their template owner in the first line. Change the owning template and regenerate the affected workflow.

## Package verification

The hosted verifier builds the workspace packages, packs them, checks their manifest targets and types, then installs them through an isolated registry into fresh consumers. This lets sibling dependencies resolve before the new versions exist on npm. The root `verifyPublishable.public` list declares the ten public packages:

- `silvery`
- `@silvery/ansi`
- `@silvery/color`
- `@silvery/command`
- `@silvery/commander`
- `@silvery/config`
- `@silvery/scope`
- `@silvery/selection`
- `@silvery/signals`
- `@silvery/syntax`

Private workspaces support the isolated verification graph and stay out of the npm publication plan. The release workflow preserves the verifier's report and tarballs as the `verified-release` artifact. It checks each retained file's SHA-512 before publication and compares the served registry integrity afterward.

## Release flow

1. Prepare the shared version in every workspace manifest, update same-repository dependency versions and the lockfile, and describe the changes in the changelog.
2. Merge the reviewed changes to `main`. Require a successful Verify run for that exact source commit.
3. Dispatch the existing Release workflow on `main`, with `commit` equal to its full source SHA and `packages` containing all public packages at that version in dependency order.
4. Inspect the build and publish jobs. Confirm every planned version resolves on npm with the retained tarball's integrity and provenance before releasing dependent repositories.
5. Reconcile release tags only after registry confirmation, pointing each tag to the verified published source.

A failed build publishes nothing. A failure during publication can leave a partial batch: retain the workflow records, inspect each package's registry state and integrity, and resolve the failed step before retrying. Published name/version pairs are immutable.

## Adding a public package

Create its workspace manifest and build output, add its name to `verifyPublishable.public`, and include it in the dependency-ordered release plan. Keep the workspace and lockfile coherent, then use the hosted verification and release flow above.
