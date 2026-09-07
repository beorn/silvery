/**
 * @failure Source guards report clean after omitting source or retired theme spellings.
 * @level l2
 * @consumer Ag invariants and km's package source guard.
 */
import * as fs from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { resolveThemeColor } from "@silvery/ansi"
import { assertCanonicalThemeTokens, sourceFiles } from "@silvery/test/source-checks"
import { LEGACY_THEME_TOKEN_CURES } from "../packages/ansi/src/style/legacy-theme-tokens.ts"
import { resolveThemeColor as runtimeResolveThemeColor } from "../packages/ansi/src/style/style.ts"

// Keep faults at the existing filesystem/resolver boundaries, without adding
// an injectable production API. Ordinary cases still use the real filesystem.
vi.mock("node:fs", async (original) => ({ ...(await original<typeof import("node:fs")>()) }))
vi.mock("@silvery/ansi", async (original) => {
  const actual = await original<typeof import("@silvery/ansi")>()
  return { ...actual, resolveThemeColor: vi.fn(actual.resolveThemeColor) }
})

const selection = {
  extensions: [".ts", ".tsx", ".md"],
  excludeDirectories: ["node_modules", "dist", ".git"],
}
let root: string
const permissionChanges: string[] = []

beforeEach(() => {
  root = fs.mkdtempSync(join(tmpdir(), "silvery-source-checks-"))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(resolveThemeColor).mockReset()
  for (const path of permissionChanges.splice(0)) fs.chmodSync(path, 0o700)
  fs.rmSync(root, { recursive: true, force: true })
})

function write(path: string, content: string | Uint8Array = "export {}\n"): string {
  const file = join(root, path)
  fs.mkdirSync(dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
  return file
}

function failure(run: () => unknown): Error {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
    return error as Error
  }
  throw new Error("Expected the source check to refuse this fixture")
}

describe("source enumeration contract", () => {
  // Existing ag walkers have different selections. This fixture proves the
  // shared walker can preserve them while retaining hidden source entries.
  it("returns stable absolute paths for explicit extensions and exact exclusions", () => {
    const expected = ["z.ts", "a.tsx", ".hidden/note.md", "tests/check.ts", "scripts/check.ts"]
    for (const path of [
      ...expected,
      "ignored.js",
      "dist/ignored.ts",
      "node_modules/ignored.md",
      ".git/ignored.ts",
    ]) {
      write(path)
    }
    expect(sourceFiles([relative(process.cwd(), root)], selection)).toEqual(
      expected.map((path) => join(root, path)).sort(),
    )
    expect(
      sourceFiles([root], {
        extensions: [".ts", ".tsx"],
        excludeDirectories: [...selection.excludeDirectories, "tests", "scripts"],
      }),
    ).toEqual([join(root, "a.tsx"), join(root, "z.ts")])
  })

  it.each([
    "empty roots",
    "empty extensions",
    "missing root",
    "file root",
    "empty root",
    "one empty among populated roots",
  ])("refuses %s", (kind) => {
    const file = write("valid/source.ts")
    const empty = join(root, "empty")
    fs.mkdirSync(empty)
    const roots =
      kind === "empty roots"
        ? []
        : kind === "missing root"
          ? [join(root, "missing")]
          : kind === "file root"
            ? [file]
            : kind === "empty root"
              ? [empty]
              : kind === "one empty among populated roots"
                ? [dirname(file), empty]
                : [root]
    const error = failure(() =>
      sourceFiles(roots, {
        ...selection,
        extensions: kind === "empty extensions" ? [] : selection.extensions,
      }),
    )
    expect(error.message).toMatch(/root|extension|source|directory/i)
    for (const path of roots) expect(error.message).toContain(resolve(path))
    if (kind === "missing root") expect(error.message).toContain("ENOENT")
  })

  // A dependency-directory link is normal in workspace farms. Pruning after
  // lstat would reject it; silently following another link could omit/escape.
  it("prunes excluded names before inspecting links and rejects every other link", () => {
    write("source.ts")
    fs.symlinkSync(join(root, "missing-target"), join(root, "node_modules"))
    expect(sourceFiles([root], selection)).toEqual([join(root, "source.ts")])
    const link = join(root, "source-link")
    fs.symlinkSync(join(root, "missing-target"), link)
    expect(failure(() => sourceFiles([root], selection)).message).toContain(link)
    expect(failure(() => sourceFiles([link], selection)).message).toMatch(/symlink|symbolic link/i)
  })

  it("refuses a selected non-regular file before opening it", async () => {
    const socket = join(root, "source.ts")
    const server = createServer()
    await new Promise<void>((done, reject) => server.once("error", reject).listen(socket, done))
    try {
      const error = failure(() => sourceFiles([root], selection))
      expect(error.message).toContain(socket)
      expect(error.message).toMatch(/regular file/i)
    } finally {
      await new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      )
    }
  })

  // The old walkers catch directory/stat failures and silently continue. A
  // privileged runner may still read mode-000 paths: inject only that denied
  // syscall in that case, rather than claiming chmod proved a kernel refusal.
  it("propagates a descendant directory read failure with its path and cause", () => {
    write("healthy.ts")
    const child = dirname(write("blocked/source.ts"))
    fs.chmodSync(child, 0)
    permissionChanges.push(child)
    let denied: unknown
    try {
      fs.readdirSync(child)
    } catch (error) {
      denied = error
    }
    if (denied === undefined) {
      const nativeRead = fs.readdirSync
      denied = Object.assign(new Error("EACCES: injected denied directory read"), {
        code: "EACCES",
      })
      vi.spyOn(fs, "readdirSync").mockImplementation((...args) => {
        if (String(args[0]) === child) throw denied
        return Reflect.apply(nativeRead, fs, args)
      })
    }
    expect(denied).toMatchObject({ code: "EACCES" })
    const error = failure(() => sourceFiles([root], selection))
    expect(error.message).toContain(child)
    expect(error.message).toContain("EACCES")
    expect(error.cause).toMatchObject({ code: "EACCES" })
  })

  it("propagates file type-check errors instead of skipping the entry", () => {
    write("healthy.ts")
    const file = write("source.ts")
    const nativeStat = fs.lstatSync
    const denied = Object.assign(new Error("EIO: failed file type check"), { code: "EIO" })
    vi.spyOn(fs, "lstatSync").mockImplementation((...args) => {
      if (String(args[0]) === file) throw denied
      return Reflect.apply(nativeStat, fs, args)
    })
    const error = failure(() => sourceFiles([root], selection))
    expect(error.message).toContain(file)
    expect(error.message).toContain("EIO")
    expect(error.cause).toBe(denied)
  })
})

describe("canonical theme source contract", () => {
  // Enumerate the SAME runtime-owned object, so a new retirement cannot land
  // outside the guard's proof. There is no copied inventory or fixed count.
  it("rejects every runtime retirement with its complete cure", () => {
    expect(Object.keys(LEGACY_THEME_TOKEN_CURES).length).toBeGreaterThan(0)
    for (const [token, cure] of Object.entries(LEGACY_THEME_TOKEN_CURES)) {
      const file = write("source.ts", `// first line\nconst color = "$${token}"\n`)
      const error = failure(() => assertCanonicalThemeTokens([root]))
      expect(error.message, token).toContain(`${file}:2`)
      expect(error.message, token).toContain(
        `Legacy theme token "$${token}" is retired; use ${cure}.`,
      )
    }
  })

  it("aggregates literals in source, comments, fixture text and Markdown with exact locations", () => {
    const source = write("stories/view.tsx", 'const color = "$warning-fg"\n// "$accent-fg"\n')
    const markdown = write(".fixtures/note.md", "Text\n`$primary` and `$muted`\n")
    const error = failure(() => assertCanonicalThemeTokens([root]))
    for (const location of [`${source}:1`, `${source}:2`, `${markdown}:2`]) {
      expect(error.message).toContain(location)
    }
    for (const token of ["warning-fg", "accent-fg", "primary", "muted"]) {
      expect(error.message).toContain(
        `Legacy theme token "$${token}" is retired; use ${LEGACY_THEME_TOKEN_CURES[token]}.`,
      )
    }
    expect(error.message).toContain(root)
    for (const scope of [".ts", ".tsx", ".md", "node_modules", "dist", ".git"]) {
      expect(error.message).toContain(scope)
    }
    expect(error.message).toMatch(/examined[^\n]*2|2[^\n]*examined/i)
  })

  it("accepts canonical, longer and custom tokens while leaving dynamic/unprefixed text outside the check", () => {
    write(
      "source.ts",
      '$fg-accent $bg-surface-default $bg-surface-raised $fg-on-warning $app-custom $primary-custom $constructor $toString $hasOwnProperty\nconst dynamic = `$${name}`; theme.primary; "muted"\n',
    )
    write("notes.md", "$fg $bg $color0 $color15\n")
    write("node_modules/ignored.ts", "$primary")
    expect(() => assertCanonicalThemeTokens([root])).not.toThrow()
  })

  it("keeps the prior right-boundary rule at punctuation, digits and hyphens", () => {
    write("source.ts", "$primary1 $primary-custom $bg-surface-raised\n")
    expect(() => assertCanonicalThemeTokens([root])).not.toThrow()
    write("source.ts", "$primary_suffix\n")
    expect(failure(() => assertCanonicalThemeTokens([root])).message).toContain(
      'Legacy theme token "$primary"',
    )
  })

  it("reports selected-file read failures with their native cause", () => {
    const file = write("source.ts")
    const denied = Object.assign(new Error("EIO: failed selected-file read"), { code: "EIO" })
    vi.spyOn(fs, "readFileSync").mockImplementationOnce(() => {
      throw denied
    })
    const error = failure(() => assertCanonicalThemeTokens([root]))
    expect(error.message).toContain(file)
    expect(error.message).toContain("EIO")
    expect(error.cause).toBe(denied)
  })

  it("refuses invalid UTF-8 rather than decoding a replacement character", () => {
    const file = write("source.ts", new Uint8Array([0xc3, 0x28]))
    const error = failure(() => assertCanonicalThemeTokens([root]))
    expect(error.message).toContain(file)
    expect(error.message).toMatch(/UTF-8|encoded data|encoding/i)
    expect(error.cause).toBeInstanceOf(Error)
  })

  // The known-retirement probe detects the previously admitted old resolver;
  // the populated canonical witness also rejects a generally broken import.
  it.each(["retirement", "canonical", "probe exception"])(
    "refuses an incompatible %s capability before scanning",
    (kind) => {
      write("source.ts")
      const unavailable = new Error("retirement probe unavailable")
      vi.mocked(resolveThemeColor).mockImplementation((name, theme) => {
        if (kind === "retirement") return undefined
        if (kind === "probe exception") {
          if (name === "$primary") throw unavailable
          return runtimeResolveThemeColor(name, theme)
        }
        if (name === "$primary") return runtimeResolveThemeColor(name, theme)
        return undefined
      })
      const error = failure(() => assertCanonicalThemeTokens([root]))
      expect(error.message).toMatch(/runtime|resolver|capability/i)
      expect(error.message).toContain(root)
      expect(error.message).toMatch(/examined[^\n]*0|0[^\n]*examined/i)
      if (kind === "probe exception") {
        expect(error.message).toContain(unavailable.message)
        expect(error.cause).toBe(unavailable)
      }
    },
  )

  it("keeps unexpected resolver exceptions visible with source context", () => {
    const file = write("source.ts", "$app-custom\n")
    const unavailable = new Error("resolver unavailable")
    vi.mocked(resolveThemeColor).mockImplementation((name, theme) => {
      if (name === "$app-custom") throw unavailable
      return runtimeResolveThemeColor(name, theme)
    })
    const error = failure(() => assertCanonicalThemeTokens([root]))
    expect(error.message).toContain(`${file}:1`)
    expect(error.message).toContain("$app-custom")
    expect(error.message).toContain(unavailable.message)
  })
})
