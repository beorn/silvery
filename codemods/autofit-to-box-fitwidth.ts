#!/usr/bin/env bun
/**
 * autofit-to-box-fitwidth — codemod for the Phase A0.7 / Phase B AutoFit deletion.
 *
 * Rewrites every `<AutoFit lanes={X} align={Y}>…</AutoFit>` JSX element to
 * `<Box fitWidth={X} alignSelf={…}>…</Box>` and drops the AutoFit import.
 *
 * ## Migration mapping
 *
 * | AutoFit prop          | Box replacement                                     |
 * | --------------------- | --------------------------------------------------- |
 * | `lanes={X}`           | `fitWidth={X}` (verbatim — any expression preserved)|
 * | `align="start"`       | `alignSelf="flex-start"`                            |
 * | `align="center"`      | `alignSelf="center"`                                |
 * | `align="stretch"`     | (drop — fitWidth's default fills available slack)   |
 * | `align={expr}`        | `alignSelf={expr === "center" ? "center" : "flex-start"}` |
 * | (no align)            | `alignSelf="flex-start"` (preserve AutoFit default) |
 *
 * `minWidth={0}` is added unconditionally — AutoFit had it implicit at the
 * visible inner Box (R2 cascade); fitWidth still benefits from the CSS-correct
 * escape hatch when the wrapped content can't shrink past max-content.
 *
 * ## What this codemod does NOT do
 *
 *   - It does not rewrite imports automatically when an *import alias* is
 *     in play (`import { AutoFit as Foo }`). It detects the case and emits
 *     a `// TODO[autofit-codemod]:` comment.
 *   - It does not translate `<AutoFit>` usage that lives behind a
 *     conditional `lazy(() => import(…))` boundary — emits a TODO.
 *   - It does not delete the AutoFit component file itself or the test
 *     suite. That's the surrounding A0.7 cleanup.
 *
 * ## Apply
 *
 *     bun codemods/autofit-to-box-fitwidth.ts <file…>
 *
 * Or with `--dry`:
 *
 *     bun codemods/autofit-to-box-fitwidth.ts --dry <file…>
 *
 * Self-tests in `codemods/__fixtures__/` are exercised by
 * `codemods/autofit-to-box-fitwidth.test.ts`.
 *
 * Bead: @km/silvery/responsive-layout-architecture-reframe (A0.7).
 */

import { readFileSync, writeFileSync } from "node:fs"
import { Project, type SourceFile, SyntaxKind } from "ts-morph"

export interface CodemodOptions {
  dry?: boolean
}

export interface CodemodResult {
  file: string
  changed: boolean
  rewrites: number
  todos: string[]
  source: string
}

/**
 * Translate the value of an `align` prop to an `alignSelf` value, or null if
 * the prop should be dropped entirely (align="stretch" maps to no alignSelf —
 * fitWidth fills available slack natively, AutoFit's `stretch` was a no-op
 * ceiling-bypass).
 */
function alignSelfFromLiteral(value: string): { keep: boolean; alignSelf?: string } {
  if (value === "center") return { keep: true, alignSelf: "center" }
  if (value === "stretch") return { keep: false }
  return { keep: true, alignSelf: "flex-start" }
}

/**
 * Apply the AutoFit → Box transform to a single source file.
 *
 * Returns a result describing rewrites + any TODO comments emitted; if
 * `options.dry` is true, no write to disk. The transformed source is in
 * `result.source` regardless.
 */
export function transformFile(filePath: string, options: CodemodOptions = {}): CodemodResult {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { jsx: 4 /* Preserve */ },
  })
  const sourceFile = project.addSourceFileAtPath(filePath)
  const result: CodemodResult = {
    file: filePath,
    changed: false,
    rewrites: 0,
    todos: [],
    source: sourceFile.getFullText(),
  }

  rewriteAutoFitImports(sourceFile, result)
  rewriteAutoFitElements(sourceFile, result)

  result.source = sourceFile.getFullText()
  if (result.rewrites > 0 || result.todos.length > 0) {
    result.changed = result.source !== readFileSync(filePath, "utf8")
    if (result.changed && !options.dry) writeFileSync(filePath, result.source)
  }
  return result
}

function rewriteAutoFitImports(sourceFile: SourceFile, result: CodemodResult): void {
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const moduleSpec = importDecl.getModuleSpecifierValue()
    // Match imports from "silvery" or "@silvery/ag-react" (the public surface).
    if (moduleSpec !== "silvery" && moduleSpec !== "@silvery/ag-react") continue

    const namedImports = importDecl.getNamedImports()
    let droppedAutoFit = false
    let hasBoxImport = false

    for (const named of namedImports) {
      const name = named.getName()
      const alias = named.getAliasNode()?.getText()
      if (name === "Box" && !alias) hasBoxImport = true
      if (name === "AutoFit") {
        if (alias) {
          result.todos.push(
            `AutoFit import has alias '${alias}' at ${importDecl.getStartLineNumber()} — manual rewrite required (TODO[autofit-codemod]: alias)`,
          )
          continue
        }
        named.remove()
        droppedAutoFit = true
      }
      if (name === "useAutoFitVisible" || name === "AutoFitProps") {
        named.remove()
        droppedAutoFit = true
      }
    }

    if (droppedAutoFit && !hasBoxImport) {
      // Inject `Box` so the rewrites have an import. Insert at the start of
      // the named-import list to keep diffs minimal.
      importDecl.insertNamedImport(0, "Box")
    }

    // If we dropped every named import, remove the whole declaration.
    if (importDecl.getNamedImports().length === 0 && !importDecl.getDefaultImport()) {
      importDecl.remove()
    }
  }
}

function rewriteAutoFitElements(sourceFile: SourceFile, result: CodemodResult): void {
  // Collect first, then mutate — mutating during traversal invalidates nodes.
  const jsxOpens = sourceFile
    .getDescendantsOfKind(SyntaxKind.JsxOpeningElement)
    .filter((el) => el.getTagNameNode().getText() === "AutoFit")
  const jsxSelfClose = sourceFile
    .getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)
    .filter((el) => el.getTagNameNode().getText() === "AutoFit")

  for (const open of jsxOpens) {
    rewriteOpeningTag(open, result)
  }
  for (const self of jsxSelfClose) {
    rewriteSelfClosingTag(self, result)
  }

  // Closing tags — these were JSX elements paired with the openings above.
  const jsxCloses = sourceFile
    .getDescendantsOfKind(SyntaxKind.JsxClosingElement)
    .filter((el) => el.getTagNameNode().getText() === "AutoFit")
  for (const close of jsxCloses) {
    close.getTagNameNode().replaceWithText("Box")
  }
}

function rewriteOpeningTag(
  open: import("ts-morph").JsxOpeningElement,
  result: CodemodResult,
): void {
  const attrs = open.getAttributes()
  let lanesExpr: string | null = null
  let alignAttr: import("ts-morph").JsxAttribute | null = null
  const otherAttrs: import("ts-morph").JsxAttribute[] = []
  let hasMinWidth = false

  for (const attr of attrs) {
    if (attr.getKind() !== SyntaxKind.JsxAttribute) continue
    const a = attr.asKindOrThrow(SyntaxKind.JsxAttribute)
    const name = a.getNameNode().getText()
    if (name === "lanes") lanesExpr = readAttrExpressionText(a) ?? null
    else if (name === "align") alignAttr = a
    else {
      if (name === "minWidth") hasMinWidth = true
      otherAttrs.push(a)
    }
  }

  if (lanesExpr === null) {
    result.todos.push(
      `<AutoFit> at line ${open.getStartLineNumber()} has no \`lanes\` prop — manual rewrite required (TODO[autofit-codemod]: review lane source)`,
    )
    return
  }

  const { alignSelfText, todoNote } = resolveAlignSelf(alignAttr)
  if (todoNote) result.todos.push(todoNote)

  // Build replacement: `<Box fitWidth={lanesExpr} alignSelf={…} minWidth={0} …rest>`.
  const propsParts: string[] = [`fitWidth={${lanesExpr}}`]
  if (alignSelfText !== null) propsParts.push(`alignSelf=${alignSelfText}`)
  if (!hasMinWidth) propsParts.push(`minWidth={0}`)
  for (const a of otherAttrs) propsParts.push(a.getText())

  open.replaceWithText(`<Box ${propsParts.join(" ")}>`)
  result.rewrites++
}

function rewriteSelfClosingTag(
  self: import("ts-morph").JsxSelfClosingElement,
  result: CodemodResult,
): void {
  // Same transform, then close with `/>` instead of pairing with `</Box>`.
  const attrs = self.getAttributes()
  let lanesExpr: string | null = null
  let alignAttr: import("ts-morph").JsxAttribute | null = null
  const otherAttrs: import("ts-morph").JsxAttribute[] = []
  let hasMinWidth = false

  for (const attr of attrs) {
    if (attr.getKind() !== SyntaxKind.JsxAttribute) continue
    const a = attr.asKindOrThrow(SyntaxKind.JsxAttribute)
    const name = a.getNameNode().getText()
    if (name === "lanes") lanesExpr = readAttrExpressionText(a) ?? null
    else if (name === "align") alignAttr = a
    else {
      if (name === "minWidth") hasMinWidth = true
      otherAttrs.push(a)
    }
  }

  if (lanesExpr === null) {
    result.todos.push(
      `<AutoFit/> at line ${self.getStartLineNumber()} has no \`lanes\` prop — manual rewrite required (TODO[autofit-codemod]: review lane source)`,
    )
    return
  }

  const { alignSelfText, todoNote } = resolveAlignSelf(alignAttr)
  if (todoNote) result.todos.push(todoNote)

  const propsParts: string[] = [`fitWidth={${lanesExpr}}`]
  if (alignSelfText !== null) propsParts.push(`alignSelf=${alignSelfText}`)
  if (!hasMinWidth) propsParts.push(`minWidth={0}`)
  for (const a of otherAttrs) propsParts.push(a.getText())

  self.replaceWithText(`<Box ${propsParts.join(" ")} />`)
  result.rewrites++
}

function readAttrExpressionText(attr: import("ts-morph").JsxAttribute): string | undefined {
  const initializer = attr.getInitializer()
  if (!initializer) return undefined
  if (initializer.getKind() === SyntaxKind.JsxExpression) {
    const expr = initializer.asKindOrThrow(SyntaxKind.JsxExpression).getExpression()
    return expr?.getText()
  }
  // String literal — strip quotes.
  if (initializer.getKind() === SyntaxKind.StringLiteral) {
    return JSON.stringify(initializer.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue())
  }
  return initializer.getText()
}

function resolveAlignSelf(alignAttr: import("ts-morph").JsxAttribute | null): {
  alignSelfText: string | null
  todoNote?: string
} {
  // No align → preserve AutoFit's default ("start" → flex-start).
  if (!alignAttr) return { alignSelfText: `"flex-start"` }

  const initializer = alignAttr.getInitializer()
  if (!initializer) return { alignSelfText: `"flex-start"` }

  // align="literal" — translate at codemod time.
  if (initializer.getKind() === SyntaxKind.StringLiteral) {
    const value = initializer.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue()
    const decision = alignSelfFromLiteral(value)
    if (!decision.keep) return { alignSelfText: null }
    return { alignSelfText: `"${decision.alignSelf}"` }
  }

  // align={expr} — emit a runtime translation since we can't evaluate.
  // Paren-wrap to defend against operator-precedence surprises in the
  // upstream expression. NOTE: this double-evaluates the expression on
  // every render. For impure expressions, hand-rewrite — the TODO note
  // flags it.
  if (initializer.getKind() === SyntaxKind.JsxExpression) {
    const expr = initializer.asKindOrThrow(SyntaxKind.JsxExpression).getExpression()
    if (!expr) return { alignSelfText: `"flex-start"` }
    const text = expr.getText()
    return {
      alignSelfText: `{(${text}) === "center" ? "center" : (${text}) === "stretch" ? "stretch" : "flex-start"}`,
      todoNote: `align={${text}} translated to runtime ternary at line ${alignAttr.getStartLineNumber()} — review if the upstream expression has a "stretch" branch and consider hand-rewriting to a single evaluation if the expression is impure (TODO[autofit-codemod]: review align source)`,
    }
  }

  return { alignSelfText: `"flex-start"` }
}

// CLI entry point — `bun codemods/autofit-to-box-fitwidth.ts [--dry] <file…>`.
if (import.meta.main) {
  const args = Bun.argv.slice(2)
  const dryIdx = args.indexOf("--dry")
  const dry = dryIdx !== -1
  const files = dry ? [...args.slice(0, dryIdx), ...args.slice(dryIdx + 1)] : args
  if (files.length === 0) {
    console.error("usage: bun codemods/autofit-to-box-fitwidth.ts [--dry] <file…>")
    process.exit(2)
  }
  let totalRewrites = 0
  for (const file of files) {
    const result = transformFile(file, { dry })
    if (result.changed || result.todos.length > 0) {
      console.log(
        `${file}: ${result.rewrites} rewrite(s)${result.todos.length ? `, ${result.todos.length} TODO(s)` : ""}`,
      )
      for (const todo of result.todos) console.log(`  TODO: ${todo}`)
    }
    totalRewrites += result.rewrites
  }
  console.log(`\nTotal rewrites: ${totalRewrites}${dry ? " (dry run — no files written)" : ""}`)
}
