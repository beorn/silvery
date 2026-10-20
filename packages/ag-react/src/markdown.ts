import { fromMarkdown } from "mdast-util-from-markdown"
import { gfmAutolinkLiteralFromMarkdown } from "mdast-util-gfm-autolink-literal"
import { gfmStrikethroughFromMarkdown } from "mdast-util-gfm-strikethrough"
import { gfmTableFromMarkdown } from "mdast-util-gfm-table"
import { gfmAutolinkLiteral } from "micromark-extension-gfm-autolink-literal"
import { gfmStrikethrough } from "micromark-extension-gfm-strikethrough"
import { gfmTable } from "micromark-extension-gfm-table"
import { combineExtensions } from "micromark-util-combine-extensions"
import type { Root } from "mdast"

/**
 * Pure GFM preserves task, property, and block-ID literals without application transforms.
 * Enables autolinks, strikethrough, and tables.
 */
export function parseMarkdown(content: string): Root {
  return fromMarkdown(content, {
    extensions: [combineExtensions([gfmAutolinkLiteral(), gfmStrikethrough(), gfmTable()])],
    mdastExtensions: [
      gfmAutolinkLiteralFromMarkdown(),
      gfmStrikethroughFromMarkdown(),
      gfmTableFromMarkdown(),
    ],
  })
}

export type PreparedMarkdown = Readonly<{
  parseSource: string
  fallbackSource: string
}>

/** Parse prepared Markdown, preserving its fallback text if parsing itself fails. */
export function parsePreparedMarkdown(input: PreparedMarkdown): Root {
  try {
    return parseMarkdown(input.parseSource)
  } catch {
    return {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: input.fallbackSource }],
        },
      ],
    }
  }
}
