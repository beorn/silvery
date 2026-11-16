import { existsSync, mkdtempSync } from "node:fs"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { loadConfig } from "../src/config.ts"

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "silvery-config-"))
})

describe("loadConfig — basics", () => {
  it("loads a missing file as empty (createIfMissing default true)", async () => {
    const config = await loadConfig({ path: join(tmpDir, "missing.yaml") })
    expect(config.get("anything")).toBeUndefined()
  })

  it("throws when createIfMissing: false and file is absent", async () => {
    await expect(
      loadConfig({ path: join(tmpDir, "absent.yaml"), createIfMissing: false }),
    ).rejects.toThrow(/does not exist/)
  })

  it("expands `~` in path", async () => {
    // We don't actually touch ~. Just verify the path field reflects expansion.
    const config = await loadConfig({ path: "~/nonexistent-test.yaml", createIfMissing: true })
    expect(config.path).toMatch(/^\/.*nonexistent-test\.yaml$/)
  })

  it("loads YAML and exposes deep keys", async () => {
    await writeFile(join(tmpDir, "c.yaml"), "ai:\n  acp:\n    default: foo\n    foo: bar\n")
    const config = await loadConfig({ path: join(tmpDir, "c.yaml") })
    expect(config.get("ai.acp.default")).toBe("foo")
    expect(config.get("ai.acp.foo")).toBe("bar")
  })

  it("applies defaults for missing keys (deep merge)", async () => {
    await writeFile(join(tmpDir, "c.yaml"), "ai:\n  acp: {}\n")
    const config = await loadConfig({
      path: join(tmpDir, "c.yaml"),
      defaults: { ai: { acp: { default: "fallback" } }, ui: { theme: "dark" } },
    })
    expect(config.get("ai.acp.default")).toBe("fallback")
    expect(config.get("ui.theme")).toBe("dark")
  })
})

describe("get / set / unset / has / list", () => {
  it("set creates intermediate objects", async () => {
    const config = await loadConfig({ path: join(tmpDir, "c.yaml") })
    config.set("ai.acp.foo", "bar")
    expect(config.get("ai.acp.foo")).toBe("bar")
    expect(config.has("ai.acp.foo")).toBe(true)
  })

  it("unset removes the leaf only", async () => {
    const config = await loadConfig({ path: join(tmpDir, "c.yaml") })
    config.set("ai.acp.foo", "bar")
    config.set("ai.acp.baz", "qux")
    config.unset("ai.acp.foo")
    expect(config.has("ai.acp.foo")).toBe(false)
    expect(config.has("ai.acp.baz")).toBe(true)
  })

  it("has returns false for missing keys", async () => {
    const config = await loadConfig({ path: join(tmpDir, "c.yaml") })
    expect(config.has("nonexistent.key")).toBe(false)
  })

  it("list returns flat key/value pairs", async () => {
    await writeFile(join(tmpDir, "c.yaml"), "a:\n  b: 1\n  c:\n    d: 2\ne: 3\n")
    const config = await loadConfig({ path: join(tmpDir, "c.yaml") })
    const list = config.list()
    expect(list).toContainEqual({ key: "a.b", value: 1 })
    expect(list).toContainEqual({ key: "a.c.d", value: 2 })
    expect(list).toContainEqual({ key: "e", value: 3 })
  })

  it("list filters by glob pattern", async () => {
    await writeFile(
      join(tmpDir, "c.yaml"),
      "ai:\n  acp:\n    foo: 1\n    bar: 2\n  mcp:\n    km: 3\n",
    )
    const config = await loadConfig({ path: join(tmpDir, "c.yaml") })
    const list = config.list({ pattern: "ai.acp.*" })
    expect(list.map((e) => e.key).sort()).toEqual(["ai.acp.bar", "ai.acp.foo"])
  })
})

describe("save — atomic write", () => {
  it("saves a new file at the path", async () => {
    const path = join(tmpDir, "new.yaml")
    const config = await loadConfig({ path })
    config.set("ai.acp.default", "claude-work")
    await config.save()
    expect(existsSync(path)).toBe(true)
    const text = await readFile(path, "utf8")
    expect(text).toContain("default: claude-work")
  })

  it("save then reload round-trips values", async () => {
    const path = join(tmpDir, "rt.yaml")
    const config = await loadConfig({ path })
    config.set("ai.acp.foo", "bar")
    config.set("ai.acp.num", 42)
    await config.save()
    await config.reload()
    expect(config.get("ai.acp.foo")).toBe("bar")
    expect(config.get("ai.acp.num")).toBe(42)
  })

  it("preserves YAML comments across load → mutate → save", async () => {
    const path = join(tmpDir, "comments.yaml")
    await writeFile(
      path,
      `# Top-level comment
ai:
  # Section comment
  acp:
    default: foo  # inline comment
    foo: "bar"
`,
    )
    const config = await loadConfig({ path })
    config.set("ai.acp.default", "baz")
    await config.save()
    const text = await readFile(path, "utf8")
    // Comments should survive the round trip.
    expect(text).toContain("# Top-level comment")
    expect(text).toContain("# Section comment")
    expect(text).toContain("default: baz")
  })

  it("writes file with 0o600 mode", async () => {
    const path = join(tmpDir, "mode.yaml")
    const config = await loadConfig({ path })
    config.set("secret", "token")
    await config.save()
    const { stat } = await import("node:fs/promises")
    const s = await stat(path)
    // Mask out the type bits; the mode lower 9 bits should be 0o600.
    expect(s.mode & 0o777).toBe(0o600)
  })
})

describe("schema validation", () => {
  it("throws on load when schema fails", async () => {
    const path = join(tmpDir, "bad.yaml")
    await writeFile(path, "ai:\n  acp:\n    default: 42\n")
    const Schema = z.object({ ai: z.object({ acp: z.object({ default: z.string() }) }) })
    await expect(loadConfig({ path, schema: Schema })).rejects.toThrow(/validation/)
  })

  it("allows valid configs to load", async () => {
    const path = join(tmpDir, "ok.yaml")
    await writeFile(path, "ai:\n  acp:\n    default: foo\n")
    const Schema = z.object({ ai: z.object({ acp: z.object({ default: z.string() }) }) })
    await expect(loadConfig({ path, schema: Schema })).resolves.toBeDefined()
  })
})

describe("onChange notifications", () => {
  it("fires on save with key/oldValue/newValue", async () => {
    const path = join(tmpDir, "notify.yaml")
    await writeFile(path, "x: 1\n")
    const config = await loadConfig({ path })
    const events: Array<[string, unknown, unknown]> = []
    config.onChange((k, o, n) => events.push([k, o, n]))
    config.set("x", 2)
    await config.save()
    expect(events).toContainEqual(["x", 1, 2])
  })

  it("unsubscribe stops notifications", async () => {
    const config = await loadConfig({ path: join(tmpDir, "u.yaml") })
    const events: string[] = []
    const off = config.onChange((k) => events.push(k))
    off()
    config.set("x", 1)
    await config.save()
    expect(events).toEqual([])
  })
})

describe("a document with YAML parser errors is refused, not half-believed", () => {
  const tmpBase = () => mkdtempSync(join(tmpdir(), "silvery-config-parser-"))

  it("refuses a duplicate key instead of keeping one of the two values", async () => {
    const path = join(tmpBase(), "config.yaml")
    await writeFile(path, "backup:\n  floor_bytes: 456\nbackup:\n  floor_bytes: 789\n")
    await expect(loadConfig({ path })).rejects.toThrow(/YAML parser error/)
    await expect(loadConfig({ path })).rejects.toThrow(/Map keys must be unique/)
  })

  it("refuses an unclosed flow collection even beside a valid key", async () => {
    const path = join(tmpBase(), "config.yaml")
    await writeFile(path, "backup:\n  floor_bytes: 789\nother: [1, 2\n")
    await expect(loadConfig({ path })).rejects.toThrow(/YAML parser error/)
  })

  it("still loads a document with warnings and unrelated settings", async () => {
    const path = join(tmpBase(), "config.yaml")
    await writeFile(path, "# a comment\nbackup:\n  floor_bytes: 5\ntagged: !foo bar\n")
    const config = await loadConfig({ path })
    expect(config.get("backup.floor_bytes")).toBe(5)
  })

  it("still loads valid configuration with comments and key order intact", async () => {
    const path = join(tmpBase(), "config.yaml")
    await writeFile(path, "# top\nbeads:\n  prefix: km\n\n# the floor\nbackup:\n  floor_bytes: 1024\n")
    const config = await loadConfig({ path })
    expect(config.get("backup.floor_bytes")).toBe(1024)
    expect(config.get("beads.prefix")).toBe("km")
  })
})
