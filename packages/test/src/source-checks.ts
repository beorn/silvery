import { lstatSync, readdirSync, readFileSync, type Stats } from "node:fs"
import { join, resolve } from "node:path"
import { resolveThemeColor } from "@silvery/ansi"

function causeText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Enumerate regular source files in stable absolute-path order.
 *
 * Every supplied root is required and must yield selected files. Directory
 * reads and type checks fail with their path and native cause. Exact excluded
 * entry names prune before inspection, including workspace dependency links;
 * all other symlinks and selected non-regular files refuse. Hidden files stay
 * in scope. A caller may omit a specifically optional root only on ENOENT;
 * this function never treats failed reads as an absent optional source tree.
 */
export function sourceFiles(
  roots: readonly string[],
  selection: {
    extensions: readonly string[]
    excludeDirectories: readonly string[]
  },
): string[] {
  const absoluteRoots = roots.map((root) => resolve(root))
  const files: string[] = []
  const scope = () =>
    `roots=${JSON.stringify(absoluteRoots)}; extensions=${JSON.stringify(selection.extensions)}; excluded names=${JSON.stringify(selection.excludeDirectories)}; selected files=${files.length}`
  const fail = (message: string, cause?: unknown) =>
    new Error(`${message}\nSource selection: ${scope()}`, { cause })
  if (roots.length === 0 || roots.some((root) => root.length === 0)) {
    throw fail("Source roots must be nonempty")
  }
  if (
    selection.extensions.length === 0 ||
    selection.extensions.some((extension) => extension.length === 0)
  ) {
    throw fail("Source extension selection must be nonempty")
  }

  function inspect(path: string): Stats {
    try {
      return lstatSync(path)
    } catch (cause) {
      throw fail(`Cannot inspect source path ${path}: ${causeText(cause)}`, cause)
    }
  }

  function walk(directory: string): void {
    let names: string[]
    try {
      names = readdirSync(directory)
    } catch (cause) {
      throw fail(`Cannot read source directory ${directory}: ${causeText(cause)}`, cause)
    }
    for (const name of names.sort()) {
      if (selection.excludeDirectories.includes(name)) continue
      const path = join(directory, name)
      const stat = inspect(path)
      if (stat.isSymbolicLink()) throw fail(`Source path is a symbolic link: ${path}`)
      if (stat.isDirectory()) {
        walk(path)
      } else if (selection.extensions.some((extension) => name.endsWith(extension))) {
        if (!stat.isFile()) throw fail(`Selected source path is not a regular file: ${path}`)
        files.push(path)
      }
    }
  }

  for (const root of absoluteRoots) {
    const stat = inspect(root)
    if (stat.isSymbolicLink()) throw fail(`Source root is a symbolic link: ${root}`)
    if (!stat.isDirectory()) throw fail(`Source root is not a directory: ${root}`)
    const before = files.length
    walk(root)
    if (files.length === before) throw fail(`Source root yielded no selected files: ${root}`)
  }
  return [...new Set(files)].sort()
}

/**
 * Reject retired dollar-prefixed theme literals in TS, TSX and Markdown,
 * including comments, fixtures, stories and hidden source. Dynamic tokens and
 * unprefixed property reads are outside this lexical check. The runtime owns
 * retirement policy and cure text; no local inventory or allowance is used.
 *
 * Required resources, invalid UTF-8 and incompatible resolver capabilities
 * fail with the queried scope and original cause. Offenders aggregate with
 * their file, line, token and complete runtime diagnostic. Silent on success.
 */
export function assertCanonicalThemeTokens(roots: readonly string[]): void {
  const selection = {
    extensions: [".ts", ".tsx", ".md"],
    excludeDirectories: ["node_modules", "dist", ".git"],
  }
  let examined = 0
  const scope = () =>
    `roots=${JSON.stringify(roots.map((root) => resolve(root)))}; extensions=${JSON.stringify(selection.extensions)}; excluded names=${JSON.stringify(selection.excludeDirectories)}; examined files=${examined}`
  const fail = (message: string, cause?: unknown) =>
    new Error(`${message}\nTheme source check: ${scope()}`, { cause })

  // An older resolver returned undefined for retired names. Supply a theme:
  // resolveThemeColor intentionally returns early when its theme is absent.
  let rejectsRetired = false
  try {
    resolveThemeColor("$primary", {})
  } catch (cause) {
    // Recognize this one capability diagnostic without copying its cure.
    // An unrelated resolver failure must not masquerade as retirement support.
    if (
      !(cause instanceof Error) ||
      !/^Legacy theme token "\$primary" is retired; use .+\.$/.test(cause.message)
    ) {
      throw fail(
        `Incompatible @silvery/ansi runtime: retirement resolver witness failed: ${causeText(cause)}`,
        cause,
      )
    }
    rejectsRetired = true
  }
  if (!rejectsRetired) {
    throw fail('Incompatible @silvery/ansi runtime: resolver did not reject retired "$primary"')
  }
  let canonical: string | undefined
  try {
    canonical = resolveThemeColor("$fg", { fg: "#123456" })
  } catch (cause) {
    throw fail(
      `Incompatible @silvery/ansi runtime: canonical resolver witness failed: ${causeText(cause)}`,
      cause,
    )
  }
  if (canonical !== "#123456") {
    throw fail('Incompatible @silvery/ansi runtime: resolver did not resolve populated "$fg"')
  }

  let files: string[]
  try {
    files = sourceFiles(roots, selection)
  } catch (cause) {
    throw fail(`Cannot enumerate theme source: ${causeText(cause)}`, cause)
  }
  const failures: Error[] = []
  for (const file of files) {
    let text: string
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(file))
    } catch (cause) {
      throw fail(`Cannot read regular UTF-8 theme source ${file}: ${causeText(cause)}`, cause)
    }
    examined++
    for (const [index, line] of text.split("\n").entries()) {
      // The previous matcher treats ASCII letters, digits and hyphens as
      // continuation characters; never cure a prefix of a longer token.
      for (const match of line.matchAll(/\$[A-Za-z0-9-]+/g)) {
        const token = match[0]
        try {
          resolveThemeColor(token, {})
        } catch (cause) {
          failures.push(new Error(`${file}:${index + 1}: ${token}: ${causeText(cause)}`, { cause }))
        }
      }
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `Theme source check: ${scope()}\n${failures.map((failure) => failure.message).join("\n")}`,
    )
  }
}
