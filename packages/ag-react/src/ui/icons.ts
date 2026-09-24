/**
 * Cross-app file-browser glyphs.
 *
 * THE DIRECTORY/FILE PAIR IS RESOLVED, NOT FIXED, and that is the whole point
 * of this module. Nerd Font glyphs are single-width line art that sits quietly
 * next to text; emoji are double-width and render everywhere. Neither is
 * correct on its own — a patched-font terminal shown emoji gets a jarring
 * mismatch against every other glyph on screen, and an unpatched terminal
 * shown Private Use Area codepoints gets tofu.
 *
 * Silvery already knows which one applies: `caps.maybeNerdFont`. Exporting a
 * frozen pair instead would push the same decision into every consuming app,
 * where each app answers it differently and they disagree on one machine.
 *
 * NAV ARROWS ARE NOT RESOLVED. U+25C4 / U+25BA are ordinary BMP geometric
 * shapes present in essentially every font and need no patched terminal, so
 * there is no second branch to pick between. They are East Asian *Ambiguous*
 * width (UAX #11) — one cell under this codebase's width policy, two under a
 * CJK-wide terminal — which is a property worth knowing but not one a
 * capability flag can decide.
 */

/** Back/forward nav arrows. Single-width under the default width policy. */
export const NAV_BACK_ICON = "◄"
export const NAV_FORWARD_ICON = "►"

/**
 * Tree-disclosure markers: a node whose children are hidden, shown, or absent.
 *
 * NOT RESOLVED, and pinned on purpose: every outline on one screen should
 * draw the same three glyphs, so they live here once rather than in each app.
 * Folded is the biggest right-pointing triangle the width table measures as
 * one cell; U+25B6 would read bigger still, but it carries emoji presentation
 * and measures two cells, which shifts every cell after it on the row.
 */
export const FOLD_MARKERS = Object.freeze({
  folded: NAV_FORWARD_ICON,
  unfolded: "•",
  empty: "·",
} as const)

/**
 * Section disclosure markers: a section is collapsed or expanded, unlike an
 * outline node with the three states above. Both triangles measure one cell
 * under the render pipeline's width policy; no variation selector is needed.
 */
export const DISCLOSURE_MARKERS = Object.freeze({
  collapsed: NAV_FORWARD_ICON,
  expanded: "▼",
} as const)

/** The pair of glyphs a file browser uses for its two node kinds. */
export interface FileBrowserIcons {
  readonly directory: string
  readonly file: string
}

/** folder-o / file-text-o — single-width, requires a patched font. */
const NERD_FONT: FileBrowserIcons = { directory: "", file: "" }

/** Emoji presentation — double-width, renders without a patched font. */
const PORTABLE: FileBrowserIcons = { directory: "\u{1F4C1}", file: "\u{1F4C4}" }

/**
 * Pick the file-browser glyph pair for a terminal.
 *
 * Pure and synchronous so it can be tested without a Term; prefer
 * `useFileBrowserIcons()` in components, which reads the capability for you.
 *
 * @param maybeNerdFont - `caps.maybeNerdFont` for the target terminal.
 */
export function fileBrowserIcons(maybeNerdFont: boolean): FileBrowserIcons {
  return maybeNerdFont ? NERD_FONT : PORTABLE
}
