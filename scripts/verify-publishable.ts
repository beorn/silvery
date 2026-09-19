#!/usr/bin/env bun
/**
 * Verify-publishable — pre-publish gate using a local verdaccio registry.
 *
 * Catches three classes of bug BEFORE tag-publish:
 *   (a) wrong publishConfig.exports / missing dist entry
 *   (b) empty tarball / missing dist
 *   (c) EPRIVATE on accidentally-listed private packages
 *   (d) production-only ESM export mismatches (for example React's dev-only act)
 *
 * The legacy verify.yml packed each tarball and ran `npm install <tgz>` in a
 * tmpdir — but the tarball's transitive deps reference @silvery/<dep>@<version>
 * which isn't on the public registry yet during a release window. The install
 * always failed with ETARGET. This script publishes everything to a private
 * verdaccio first so transitive deps resolve.
 *
 * Usage:
 *   bun run scripts/verify-publishable.ts          # build + verify
 *   bun run scripts/verify-publishable.ts --no-build  # skip build step
 *   bun run scripts/verify-publishable.ts --keep      # leave verdaccio + tmpdirs alive
 */

import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"

const ROOT = resolve(import.meta.dirname ?? import.meta.dir, "..")
const KEEP = process.argv.includes("--keep")
const NO_BUILD = process.argv.includes("--no-build")
const REGISTRY_PORT = Number(process.env.VERDACCIO_PORT ?? 4873)
const REGISTRY = `http://127.0.0.1:${REGISTRY_PORT}`

export interface PackageEntry {
  dir: string
  name: string
  /** Expected to publish to public npm in CI (matches release.yml's skip logic).
   * If `private:true` is found at run time, the gate FAILS for these (catches
   * "accidentally added private to a should-be-public package"). For internals,
   * we strip `private` only inside verdaccio so cross-deps resolve. */
  expectPublic: boolean
}

// Same publish order as release.yml. Internal packages are sandbox-published to
// verdaccio so cross-deps resolve; only `expectPublic` ones are import-probed.
export const PACKAGES: PackageEntry[] = [
  { dir: "packages/command", name: "@silvery/command", expectPublic: true },
  { dir: "packages/ag", name: "@silvery/ag", expectPublic: false },
  { dir: "packages/ag-react", name: "@silvery/ag-react", expectPublic: false },
  { dir: "packages/scope", name: "@silvery/scope", expectPublic: false },
  { dir: "packages/signals", name: "@silvery/signals", expectPublic: false },
  { dir: "packages/color", name: "@silvery/color", expectPublic: true },
  { dir: "packages/headless", name: "@silvery/headless", expectPublic: false },
  { dir: "packages/theme", name: "@silvery/theme", expectPublic: false },
  { dir: "packages/ag-term", name: "@silvery/ag-term", expectPublic: false },
  { dir: "packages/ansi", name: "@silvery/ansi", expectPublic: true },
  { dir: "packages/commands", name: "@silvery/commands", expectPublic: false },
  { dir: "packages/ink", name: "@silvery/ink", expectPublic: false },
  { dir: "packages/create", name: "@silvery/create", expectPublic: false },
  { dir: "packages/test", name: "@silvery/test", expectPublic: false },
  { dir: "packages/commander", name: "@silvery/commander", expectPublic: true },
  { dir: "packages/config", name: "@silvery/config", expectPublic: false },
  { dir: "packages/syntax", name: "@silvery/syntax", expectPublic: false },
  { dir: ".", name: "silvery", expectPublic: true },
]

interface PackageJson {
  name: string
  version: string
  private?: boolean
  publishConfig?: { access?: string; exports?: unknown }
  tsdown?: unknown
  [key: string]: unknown
}

const cleanupActions: Array<() => void> = []
function onExit(fn: () => void) {
  cleanupActions.push(fn)
}
function runCleanup() {
  if (KEEP) {
    console.log("\n[--keep] Skipping cleanup. Verdaccio + tmpdirs preserved.")
    return
  }
  for (const fn of cleanupActions.reverse()) {
    try {
      fn()
    } catch {}
  }
}

function fail(msg: string): never {
  console.error(`\n❌ ${msg}`)
  runCleanup()
  process.exit(1)
}

function writePkg(dir: string, pkg: PackageJson) {
  writeFileSync(join(ROOT, dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n")
}

function installVerdaccio(installDir: string): string {
  console.log("Installing verdaccio (one-time per run)...")
  mkdirSync(installDir, { recursive: true })
  // Initialize a clean workspace then install verdaccio. This avoids npx's
  // network round-trip every invocation (and works around npx's habit of
  // resolving the verdaccio package against whatever registry is configured —
  // which can briefly include the verdaccio we are about to start).
  let r = spawnSync("npm", ["init", "-y", "--silent"], {
    cwd: installDir,
    encoding: "utf-8",
    env: {
      ...process.env,
      // Use the user's default registry, NEVER the local one.
      npm_config_registry: "https://registry.npmjs.org/",
    },
  })
  if (r.status !== 0) throw new Error(`npm init failed: ${r.stderr}`)
  r = spawnSync(
    "npm",
    ["install", "--no-fund", "--no-audit", "--no-package-lock", "--silent", "verdaccio@6"],
    {
      cwd: installDir,
      encoding: "utf-8",
      env: {
        ...process.env,
        npm_config_registry: "https://registry.npmjs.org/",
      },
    },
  )
  if (r.status !== 0) throw new Error(`verdaccio install failed: ${r.stderr}\n${r.stdout}`)
  const bin = join(installDir, "node_modules", ".bin", "verdaccio")
  if (!existsSync(bin)) throw new Error(`verdaccio binary not found at ${bin}`)
  console.log(`  ✓ verdaccio installed at ${bin}`)
  return bin
}

async function startVerdaccio(
  storage: string,
  verdaccioBin: string,
): Promise<{ stop: () => void }> {
  const configPath = join(storage, "config.yaml")
  // Upstream: real npm for external deps (string-width, commander, react, ...).
  // For @silvery/* and silvery: ONLY accept anonymous publish to local — never
  // proxy to npm. This guarantees the import probe sees the JUST-PUBLISHED
  // tarballs, not whatever is currently on the public registry.
  const config = `
storage: ${storage}/storage
auth:
  htpasswd:
    file: ${storage}/htpasswd
    max_users: -1
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
    cache: false
    timeout: 30s
    max_fails: 3
    fail_timeout: 10m
packages:
  '@silvery/*':
    access: $anonymous
    publish: $anonymous
    unpublish: $anonymous
  'silvery':
    access: $anonymous
    publish: $anonymous
    unpublish: $anonymous
  '@*/*':
    access: $anonymous
    publish: $anonymous
    proxy: npmjs
  '**':
    access: $anonymous
    publish: $anonymous
    unpublish: $anonymous
    proxy: npmjs
log: { type: stdout, format: pretty-timestamped, level: warn }
listen: 127.0.0.1:${REGISTRY_PORT}
`
  writeFileSync(configPath, config)

  console.log(`Starting verdaccio on ${REGISTRY}...`)
  const proc = spawn(verdaccioBin, ["--config", configPath], {
    cwd: storage,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    // Strip any inherited registry env that might confuse verdaccio.
    env: {
      ...process.env,
      npm_config_registry: undefined,
      NPM_CONFIG_REGISTRY: undefined,
    } as NodeJS.ProcessEnv,
  })

  let ready = false
  let logBuf = ""
  proc.stdout?.on("data", (chunk: Buffer) => {
    const s = chunk.toString()
    logBuf += s
    if (s.includes("http address") || s.includes("listening on")) ready = true
    if (process.env.VERDACCIO_DEBUG) process.stdout.write(`[verdaccio] ${s}`)
  })
  proc.stderr?.on("data", (chunk: Buffer) => {
    logBuf += chunk.toString()
    if (process.env.VERDACCIO_DEBUG) process.stderr.write(`[verdaccio:err] ${chunk.toString()}`)
  })
  let exited = false
  let exitCode: number | null = null
  proc.on("exit", (code) => {
    exited = true
    exitCode = code
    if (!ready && code !== 0) {
      console.error(`verdaccio exited early (code ${code}). Captured output:\n${logBuf}`)
    }
  })

  // Wait for it to accept connections (verdaccio has a slow first-run npx install)
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (exited) {
      throw new Error(
        `verdaccio process exited (code ${exitCode}) before accepting connections. Captured:\n${logBuf}`,
      )
    }
    try {
      const res = await fetch(`${REGISTRY}/-/ping`)
      if (res.ok) {
        console.log(`  ✓ verdaccio ready`)
        return {
          stop: () => {
            try {
              proc.kill("SIGTERM")
            } catch {}
          },
        }
      }
    } catch {}
    await sleep(500)
  }
  proc.kill("SIGTERM")
  throw new Error(`verdaccio failed to start within 90s. Captured:\n${logBuf}`)
}

function buildAll() {
  if (NO_BUILD) {
    console.log("Skipping build (--no-build)")
    return
  }
  console.log("Building all packages (bun run build:all)...")
  const result = spawnSync("bun", ["run", "build:all"], {
    cwd: ROOT,
    stdio: "inherit",
    encoding: "utf-8",
  })
  if (result.status !== 0) fail(`build:all failed (exit ${result.status})`)
  console.log("  ✓ build complete\n")
}

interface PreparedPkg {
  entry: PackageEntry
  pkg: PackageJson
  origJson: string
  /** True if the original package.json is unmarked (or `private:false`). */
  origPublic: boolean
}

function preparePackage(entry: PackageEntry): PreparedPkg {
  const pkgPath = join(ROOT, entry.dir, "package.json")
  const origJson = readFileSync(pkgPath, "utf-8")
  const pkg = JSON.parse(origJson) as PackageJson
  const origPublic = !pkg.private
  return { entry, pkg, origJson, origPublic }
}

function restorePackage(prepared: PreparedPkg) {
  writeFileSync(join(ROOT, prepared.entry.dir, "package.json"), prepared.origJson)
}

function publishToVerdaccio(prepared: PreparedPkg, npmrc: string) {
  const { entry } = prepared
  const dir = join(ROOT, entry.dir)
  const result = spawnSync(
    "pnpm",
    ["publish", "--registry", REGISTRY, "--no-git-checks", "--access", "public"],
    {
      cwd: dir,
      env: {
        ...process.env,
        NPM_CONFIG_USERCONFIG: npmrc,
        npm_config_userconfig: npmrc,
        npm_config_registry: REGISTRY,
      },
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  )
  if (result.error) {
    // Spawn never happened (ENOENT and friends): stdout/stderr are null, so
    // printing them tells the reader nothing. Name the real failure.
    fail(`could not run \`pnpm publish\` for ${entry.name} in ${dir}: ${result.error.message}`)
  }
  if (result.status !== 0) {
    console.error(`\n[verdaccio publish] ${entry.name} stdout:\n${result.stdout}`)
    console.error(`\n[verdaccio publish] ${entry.name} stderr:\n${result.stderr}`)
    fail(`pnpm publish failed for ${entry.name} (exit ${result.status})`)
  }
  console.log(`  ✓ published ${entry.name}@${prepared.pkg.version}`)
}

interface ProbeResult {
  name: string
  version: string
  ok: boolean
  message: string
}

function importProbe(prepared: PreparedPkg, npmrc: string): ProbeResult {
  const { entry, pkg } = prepared
  const probeDir = mkdtempSync(join(tmpdir(), `silvery-probe-${entry.name.replace(/[/@]/g, "_")}-`))
  onExit(() => rmSync(probeDir, { recursive: true, force: true }))

  // npm init
  let r = spawnSync("npm", ["init", "-y", "--silent"], {
    cwd: probeDir,
    env: { ...process.env, NPM_CONFIG_USERCONFIG: npmrc },
    encoding: "utf-8",
  })
  if (r.status !== 0) {
    return {
      name: entry.name,
      version: pkg.version,
      ok: false,
      message: `npm init failed:\n${r.stderr}`,
    }
  }

  // npm install <pkg>@<version> from verdaccio
  r = spawnSync(
    "npm",
    [
      "install",
      "--no-package-lock",
      "--no-fund",
      "--no-audit",
      "--registry",
      REGISTRY,
      `${entry.name}@${pkg.version}`,
    ],
    {
      cwd: probeDir,
      env: { ...process.env, NPM_CONFIG_USERCONFIG: npmrc },
      encoding: "utf-8",
    },
  )
  if (r.status !== 0) {
    return {
      name: entry.name,
      version: pkg.version,
      ok: false,
      message: `npm install failed:\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
    }
  }

  const probeScript = `
import('${entry.name}').then(m => {
  const keys = Object.keys(m).slice(0, 3)
  if (keys.length === 0) {
    console.error('NO_EXPORTS')
    process.exit(2)
  }
  console.log('OK ' + keys.join(','))
}).catch(e => {
  console.error('IMPORT_ERROR:', e?.message || String(e))
  process.exit(3)
})
`
  const imports: string[] = []
  for (const mode of ["development", "production"] as const) {
    r = spawnSync("node", ["--input-type=module", "-e", probeScript], {
      cwd: probeDir,
      env: { ...process.env, NODE_ENV: mode, NPM_CONFIG_USERCONFIG: npmrc },
      encoding: "utf-8",
    })
    if (r.status !== 0) {
      return {
        name: entry.name,
        version: pkg.version,
        ok: false,
        message: `${mode} import() failed:\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
      }
    }
    imports.push(`${mode}: ${r.stdout.trim()}`)
  }
  return { name: entry.name, version: pkg.version, ok: true, message: imports.join("; ") }
}

// Tarball-size regression gate, introduced after the 0.21.0 native-binary
// bundle leak. Size alone cannot identify the cause: inspect npm's file list.
// `npm pack` honours `files`/dist, so the dry-run size ≈ the published size.
// Ref @silvery/release verdaccio-413.
const MAX_UNPACKED_BYTES = 25 * 1024 * 1024

function checkPackSizes() {
  console.log(
    "\nTarball-size gate (regression backstop for the 0.21.0 native-binary bundle leak)...",
  )
  const oversized: string[] = []
  for (const entry of PACKAGES) {
    // Pack the package dir directly, NOT the workspace root — a root pack can hit
    // npm's overrides-vs-direct-dep conflict, and per-dir matches what publishes anyway.
    // --ignore-scripts: build:all built dist; prepack would rebuild it and log ahead of the JSON.
    const r = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: join(ROOT, entry.dir),
      encoding: "utf-8",
      env: { ...process.env, npm_config_registry: "https://registry.npmjs.org/" },
    })
    const query = `${entry.name}: npm pack --dry-run --json --ignore-scripts in ${join(ROOT, entry.dir)}`
    if (r.error || r.signal || r.status !== 0) {
      fail(
        `${query} failed; tarball size could not be verified (exit ${r.status}, signal ${r.signal ?? "none"}).\n` +
          `spawn error: ${r.error?.message ?? "none"}\nstdout:\n${r.stdout ?? "(unavailable)"}\nstderr:\n${r.stderr ?? "(unavailable)"}`,
      )
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(r.stdout)
    } catch (error) {
      fail(
        `${query} returned invalid JSON: ${String(error)}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
      )
    }
    const info: unknown = Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : undefined
    const unpacked =
      typeof info === "object" && info !== null && "unpackedSize" in info
        ? info.unpackedSize
        : undefined
    if (typeof unpacked !== "number" || !Number.isSafeInteger(unpacked) || unpacked <= 0) {
      fail(
        `${query} must return one package with a positive integer unpackedSize.\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
      )
    }
    const mb = (unpacked / 1024 / 1024).toFixed(1)
    if (unpacked > MAX_UNPACKED_BYTES) {
      oversized.push(
        `${entry.name}: ${mb} MB unpacked (limit ${(MAX_UNPACKED_BYTES / 1024 / 1024).toFixed(0)} MB)`,
      )
      console.error(`  ✗ ${entry.name}: ${mb} MB`)
    } else {
      console.log(`  ✓ ${entry.name}: ${mb} MB`)
    }
  }
  if (oversized.length > 0) {
    fail(
      `tarball size exceeds the limit:\n  - ${oversized.join("\n  - ")}\n  Inspect npm pack --dry-run --json in each listed package directory to identify the large files; size alone does not establish the cause.`,
    )
  }
}

// --- main ---

/**
 * Every external binary this gate shells out to, and who needs it.
 *
 * Without this preflight a missing binary surfaces as `spawnSync` returning
 * status null with null stdout/stderr — which the publish step then reported
 * as "pnpm publish failed" with two empty output blocks, hiding the real
 * cause (pnpm simply absent from PATH). Fail loudly, naming the tool, the
 * step that needs it, and the PATH we searched.
 */
const REQUIRED_TOOLS: ReadonlyArray<{ bin: string; neededFor: string; install: string }> = [
  { bin: "bun", neededFor: "build:all", install: "https://bun.sh" },
  { bin: "npm", neededFor: "pack-size gate and the import probes", install: "ships with Node.js" },
  { bin: "node", neededFor: "import probes", install: "https://nodejs.org (>=24)" },
  {
    bin: "pnpm",
    neededFor: "publishing to the local verdaccio registry",
    install: "corepack enable pnpm",
  },
]

function requireExternalTools() {
  const missing: string[] = []
  for (const tool of REQUIRED_TOOLS) {
    const probe = spawnSync(tool.bin, ["--version"], { encoding: "utf-8", stdio: "ignore" })
    // ENOENT (or any spawn-level error) means the binary is not on PATH. A
    // non-zero exit from a binary that DID run is not our concern here.
    if (probe.error) {
      missing.push(
        `${tool.bin} — needed for ${tool.neededFor}; spawn failed: ${probe.error.message}; install: ${tool.install}`,
      )
    }
  }
  if (missing.length > 0) {
    fail(
      `verify-publishable requires external tools that are not on PATH:\n  - ${missing.join("\n  - ")}\n` +
        `PATH searched:\n  ${(process.env.PATH ?? "(unset)").split(":").join("\n  ")}`,
    )
  }
}

async function main() {
  console.log("silvery verify-publishable (verdaccio gate)")
  console.log("===========================================\n")

  // Before any slow work: prove every binary we shell out to actually exists.
  requireExternalTools()

  buildAll()

  // Fail-fast size gate BEFORE the slow verdaccio publish/probe flow.
  checkPackSizes()

  // Storage / npmrc — fresh tmpdir per run so verdaccio starts empty
  const storage = mkdtempSync(join(tmpdir(), "silvery-verdaccio-"))
  mkdirSync(join(storage, "storage"), { recursive: true })
  writeFileSync(join(storage, "htpasswd"), "")
  onExit(() => rmSync(storage, { recursive: true, force: true }))

  const npmrc = join(storage, ".npmrc")
  writeFileSync(
    npmrc,
    [
      `registry=${REGISTRY}`,
      `@silvery:registry=${REGISTRY}`,
      // Anonymous publish requires no auth — but pnpm/npm sometimes complain
      // about a missing _authToken. Provide a dummy.
      `//127.0.0.1:${REGISTRY_PORT}/:_authToken=anonymous`,
      ``,
    ].join("\n"),
  )

  const installDir = mkdtempSync(join(tmpdir(), "silvery-verdaccio-bin-"))
  onExit(() => rmSync(installDir, { recursive: true, force: true }))
  const verdaccioBin = installVerdaccio(installDir)

  const verdaccio = await startVerdaccio(storage, verdaccioBin)
  onExit(() => verdaccio.stop())

  // Prepare every package. Two concerns kept separate:
  //   1. Sandbox-publish to verdaccio — every package, so cross-deps resolve.
  //      For internals (expectPublic:false), strip `private` temporarily.
  //   2. Real-publish reachability — for expectPublic packages, refuse to
  //      proceed if the original package.json has `private:true` or is missing
  //      `publishConfig.access:public` (catches class-(c) bug: "accidentally
  //      added private to a should-be-public package").
  const prepared = PACKAGES.map(preparePackage)
  onExit(() => {
    for (const p of prepared) restorePackage(p)
  })

  const cClassErrors: string[] = []
  for (const p of prepared) {
    if (!p.entry.expectPublic) continue
    if (p.pkg.private === true) {
      cClassErrors.push(
        `${p.entry.name} is expectPublic but has private:true — npm publish would EPRIVATE`,
      )
    }
    if (p.pkg.publishConfig?.access !== "public") {
      cClassErrors.push(`${p.entry.name} is expectPublic but publishConfig.access is not "public"`)
    }
  }
  if (cClassErrors.length > 0) {
    fail(`pre-publish checks failed:\n  - ${cClassErrors.join("\n  - ")}`)
  }

  for (const p of prepared) {
    if (p.pkg.private) {
      // strip private just for verdaccio sandbox — restored below
      const stripped: PackageJson = { ...p.pkg }
      delete stripped.private
      stripped.publishConfig = { ...stripped.publishConfig, access: "public" }
      writePkg(p.entry.dir, stripped)
    }
  }

  console.log("\nPublishing all packages to verdaccio...")
  for (const p of prepared) {
    publishToVerdaccio(p, npmrc)
  }

  // Restore package.json files BEFORE the import probe (so dev workspace
  // is back to normal — the probe runs entirely in /tmp using the published
  // verdaccio tarballs).
  for (const p of prepared) restorePackage(p)

  // Probe only the packages that release.yml actually ships to npm.
  const probeTargets = prepared.filter((p) => p.entry.expectPublic)
  console.log(`\nImport-probing ${probeTargets.length} public packages from verdaccio...`)

  const results: ProbeResult[] = []
  for (const p of probeTargets) {
    const result = importProbe(p, npmrc)
    if (result.ok) {
      console.log(`  ✓ ${result.name}@${result.version} → import OK [${result.message}]`)
    } else {
      console.error(`  ✗ ${result.name}@${result.version}`)
      console.error(
        result.message
          .split("\n")
          .map((l) => `      ${l}`)
          .join("\n"),
      )
    }
    results.push(result)
  }

  const failed = results.filter((r) => !r.ok)
  if (failed.length > 0) {
    fail(
      `${failed.length}/${results.length} package(s) failed verify-publishable: ${failed.map((r) => r.name).join(", ")}`,
    )
  }

  console.log(`\n✅ verify-publishable: ${results.length}/${results.length} packages OK`)
  runCleanup()
}

if (import.meta.main) {
  process.on("SIGINT", () => {
    runCleanup()
    process.exit(130)
  })
  process.on("SIGTERM", () => {
    runCleanup()
    process.exit(143)
  })

  main().catch((err: unknown) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : err)
    runCleanup()
    process.exit(1)
  })
}
