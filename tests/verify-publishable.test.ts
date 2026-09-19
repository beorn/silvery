/**
 * @failure A failed or invalid npm size query silently passes the release gate.
 * @level l3
 * @consumer Release maintainers and Verify Publishable CI.
 * retire-when: The release gate no longer shells out to npm for tarball sizes.
 */
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { expect, test } from "vitest"
import { PACKAGES } from "../scripts/verify-publishable.ts"

const ROOT = resolve(import.meta.dirname, "..")
const LIMIT = 25 * 1024 * 1024

test.each([
  {
    name: "failed query",
    status: 42,
    stdout: "npm error JSON",
    stderr: "\nEOVERRIDE: conflicting override",
    reason: "EOVERRIDE",
    accepted: false,
  },
  {
    name: "malformed JSON",
    status: 0,
    stdout: "not-json",
    stderr: "",
    reason: "invalid",
    accepted: false,
  },
  {
    name: "missing size",
    status: 0,
    stdout: "[{}]",
    stderr: "",
    reason: "unpackedSize",
    accepted: false,
  },
  {
    name: "non-numeric size",
    status: 0,
    stdout: '[{"unpackedSize":"1"}]',
    stderr: "",
    reason: "unpackedSize",
    accepted: false,
  },
  {
    name: "negative size",
    status: 0,
    stdout: '[{"unpackedSize":-1}]',
    stderr: "",
    reason: "unpackedSize",
    accepted: false,
  },
  {
    name: "oversized package",
    status: 0,
    stdout: JSON.stringify([{ unpackedSize: LIMIT + 1 }]),
    stderr: "",
    reason: "limit 25",
    accepted: false,
  },
  {
    name: "exact size limit",
    status: 0,
    stdout: JSON.stringify([{ unpackedSize: LIMIT }]),
    stderr: "",
    reason: "",
    accepted: true,
  },
])("size gate: $name", ({ status, stdout, stderr, reason, accepted }) => {
  const bin = mkdtempSync(join(tmpdir(), "silvery-pack-gate-"))
  try {
    // Exercise the real CLI and package traversal; only the external commands
    // are fixtures. Refuse npm init so no test can install or publish anything.
    writeFileSync(
      join(bin, "npm"),
      `#!/bin/sh
if [ "$1" = "--version" ]; then exit 0; fi
if [ "$1" != "pack" ]; then echo "fixture: registry work forbidden" >&2; exit 99; fi
if [ "$PWD" = "$PACK_TEST_ROOT" ]; then
  printf '%s' "$PACK_TEST_STDOUT"
  printf '%s' "$PACK_TEST_STDERR" >&2
  exit "$PACK_TEST_STATUS"
fi
printf '[{"unpackedSize":1}]'
`,
      { mode: 0o755 },
    )
    writeFileSync(join(bin, "pnpm"), "#!/bin/sh\nexit 0\n", { mode: 0o755 })
    const result = spawnSync("bun", [join(ROOT, "scripts/verify-publishable.ts"), "--no-build"], {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 10_000,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        PACK_TEST_ROOT: ROOT,
        PACK_TEST_STDOUT: stdout,
        PACK_TEST_STDERR: stderr,
        PACK_TEST_STATUS: String(status),
      },
    })
    expect(result.error).toBeUndefined()
    expect(result.status).toBe(1)
    if (accepted) {
      expect(result.stdout).toContain("✓ silvery: 25.0 MB")
      expect(result.stderr).toContain("fixture: registry work forbidden")
    } else {
      expect(result.stdout).not.toContain("Installing verdaccio")
      expect(result.stderr).toContain("silvery")
      expect(result.stderr).toContain(reason)
      if (status !== 0) {
        expect(result.stderr).toContain("42")
        expect(result.stderr).toContain(stdout)
        expect(result.stderr).toContain(ROOT)
      }
    }
  } finally {
    rmSync(bin, { recursive: true, force: true })
  }
})

test("PACKAGES includes every package published in release.yml", () => {
  const releaseYml = readFileSync(join(ROOT, ".github/workflows/release.yml"), "utf-8")
  const publishedDirs = Array.from(releaseYml.matchAll(/^\s+publish\s+([^\s#]+)/gm))
    .map((m) => m[1] ?? "")
    .filter((dir) => {
      if (!dir) return false
      const pkgPath = join(ROOT, dir, "package.json")
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { private?: boolean }
      return !pkg.private
    })
  expect(publishedDirs.length).toBeGreaterThan(0)
  const registeredDirs = new Set(PACKAGES.map((p) => p.dir))

  for (const dir of publishedDirs) {
    expect(
      registeredDirs.has(dir),
      `Package dir "${dir}" from release.yml is missing from PACKAGES in scripts/verify-publishable.ts`,
    ).toBe(true)
  }
})
