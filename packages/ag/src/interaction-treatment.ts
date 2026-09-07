import type { InteractiveState, StyleProps } from "./types"

export type InteractionRole = "content-link" | "control" | "region"
export type InteractionVisual = Readonly<
  Partial<Pick<StyleProps, "color" | "backgroundColor" | "bold" | "inverse">> & {
    dim?: boolean
    gutterColor?: string
  }
>
export type InteractionSurface = Readonly<{
  idle?: InteractionVisual
  revealed?: InteractionVisual
  armed?: InteractionVisual
  selected?: InteractionVisual
  focused?: InteractionVisual
  pointer?: "revealed" | "none"
}>

declare const interactionSurfaceRecipe: unique symbol
export type InteractionSurfaceRecipe = InteractionSurface &
  Readonly<{ [interactionSurfaceRecipe]: true }>
const recipe = (surface: InteractionSurface): InteractionSurfaceRecipe =>
  surface as InteractionSurfaceRecipe
const fg = (color: string, bold = false): InteractionVisual =>
  bold ? { color, bold: true } : { color }
const bg = (backgroundColor: string): InteractionVisual => ({ backgroundColor })
const fill = (color: string, backgroundColor: string, bold = false): InteractionVisual =>
  bold ? { color, backgroundColor, bold: true } : { color, backgroundColor }

export type ActionFillTone = "accent" | "info" | "warning"
export type ActionFillResting = "transparent" | "quiet" | "inverse" | "filled" | "selected"
const toneFills = {
  accent: ["$bg-accent", "$bg-accent"],
  info: ["$bg-info", "$bg-info"],
  warning: ["$bg-warning", "$bg-warning"],
} as const

export function actionFill(
  tone: ActionFillTone = "accent",
  resting: ActionFillResting = "transparent",
): InteractionSurfaceRecipe {
  const [background, filled] = toneFills[tone]
  const active = fill("$bg", background)
  switch (resting) {
    case "quiet":
      return recipe({ idle: fill("$fg-muted", "$bg-muted"), revealed: fill("$bg", "$bg-accent") })
    case "inverse":
      return recipe({
        idle: fill("$fg-on-inverse", "$bg-inverse"),
        revealed: fill("$bg", background),
      })
    case "filled":
      return recipe({ idle: fill("$bg", background), revealed: fill("$bg", filled) })
    case "selected":
      return recipe({ idle: active, revealed: active })
    default:
      return recipe({ idle: {}, revealed: active })
  }
}

export const textPair = (idle = "$fg-muted", revealed = "$fg"): InteractionSurfaceRecipe =>
  recipe({ idle: fg(idle), revealed: fg(revealed) })
export const cardOutline = (previewRevealed: boolean): InteractionSurfaceRecipe =>
  recipe({
    revealed: fg(previewRevealed ? "$fg-link-hover" : "$fg-muted"),
    pointer: previewRevealed ? "revealed" : "none",
  })
export const togglePillSurface = (
  active: boolean,
  itemRevealed: boolean,
  activeColor: string,
  activeHoverColor: string,
): InteractionSurfaceRecipe =>
  recipe({
    idle: fg(active ? "$fg-muted" : "$border-default"),
    revealed: itemRevealed
      ? fill(active ? activeHoverColor : "$fg-muted", "$bg-surface-hover")
      : fg(active ? activeColor : "$border-default"),
    pointer: "none",
  })

const hoverBg = bg("$bg-surface-hover")
const primary = fg("$fg-accent")
export const interactionSurfaceRecipes = Object.freeze({
  surfaceHover: recipe({ revealed: hoverBg }),
  bare: recipe({}),
  neutralText: textPair(),
  accentText: textPair("$fg-muted", "$fg-accent"),
  accentReveal: recipe({ revealed: primary, selected: primary }),
  accentSurface: recipe({ revealed: fill("$fg-accent", "$bg-surface-hover") }),
  mutedAccentSurface: recipe({
    idle: fg("$fg-muted"),
    revealed: fill("$fg-accent", "$bg-surface-hover"),
  }),
  inverseWash: recipe({ revealed: bg("$bg-inverse-hover") }),
  inverseText: textPair("$fg-on-inverse-muted", "$fg-on-inverse"),
  raisedWash: recipe({ idle: bg("$bg-surface-raised"), revealed: hoverBg }),
  raisedOverlay: recipe({ idle: bg("$bg-surface-raised"), revealed: bg("$bg-surface-overlay") }),
  strongText: recipe({ idle: fg("$fg-muted"), revealed: fg("$fg", true) }),
  boldReveal: recipe({ idle: fg("$fg"), revealed: fg("$fg", true) }),
  surfaceHoverFocused: recipe({ revealed: hoverBg, focused: hoverBg }),
  toggleGroup: textPair("$border-default", "$fg-muted"),
  selectableNav: recipe({
    idle: fg("$fg"),
    revealed: hoverBg,
    selected: fill("$fg-accent", "$bg-selected", true),
  }),
  dragHandle: recipe({
    idle: fill("$fg-muted", "$bg-muted"),
    revealed: fill("$fg-accent", "$bg-accent"),
    armed: fill("$fg-accent", "$bg-accent"),
  }),
  warningText: recipe({
    idle: fg("$fg"),
    revealed: fg("$fg-warning"),
    selected: fg("$fg-warning"),
  }),
  cursorSurface: recipe({ revealed: bg("$bg-cursor"), selected: bg("$bg-cursor") }),
} as const satisfies Record<string, InteractionSurfaceRecipe>)

export type InteractionSurfaceName = keyof typeof interactionSurfaceRecipes
export type InteractionSurfaceInput = InteractionSurfaceName | InteractionSurfaceRecipe
export const customInteractionSurface = (surface: InteractionSurface): InteractionSurfaceRecipe =>
  recipe(surface)

export type InteractionTreatment = InteractionVisual &
  Readonly<{
    reveal: "cmd-hover" | "hover"
    extent: "gutter" | undefined
    mouseCursor: "pointer" | undefined
  }>

export function resolveInteractionTreatment(
  state: Readonly<InteractiveState>,
  role: InteractionRole,
  input: InteractionSurfaceInput,
): InteractionTreatment {
  const surface: InteractionSurface =
    typeof input === "string" ? interactionSurfaceRecipes[input] : input
  const visual: InteractionVisual = {
    ...surface.idle,
    ...(state.hovered ? surface.revealed : undefined),
    ...(state.focused ? surface.focused : undefined),
    ...(state.selected ? surface.selected : undefined),
    ...(state.armed ? surface.armed : undefined),
  }
  return {
    ...visual,
    reveal: role === "content-link" ? "cmd-hover" : "hover",
    extent: role === "region" ? "gutter" : undefined,
    gutterColor:
      role === "region" && state.hovered
        ? (visual.gutterColor ?? visual.color ?? "$fg-accent-hover")
        : visual.gutterColor,
    mouseCursor:
      (surface.pointer ?? "revealed") === "revealed" && state.hovered ? "pointer" : undefined,
  }
}
