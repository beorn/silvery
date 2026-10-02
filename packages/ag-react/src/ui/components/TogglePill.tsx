/**
 * TogglePill Component
 *
 * A compact, clickable toggle rendered as an inline pill — the general-purpose
 * form of ag code's bottom-bar mode toggles (focus / fast). Pills sit VERY dim
 * when idle, brighten when their group is hovered, and reach their active colour
 * (plus a hover background) under the pointer. Clicking toggles. Group hover is
 * tracked by `TogglePillGroup` and shared through context, so hovering anywhere
 * in the group lifts every pill together — and, because a pill always renders
 * its label (only the colour changes), the row never reflows on hover.
 *
 * Usage:
 * ```tsx
 * <TogglePillGroup label="FILTER">
 *   <TogglePill label="[p]ending" active={pending} onToggle={togglePending} />
 *   <TogglePill label="[r]unning" active={running} onToggle={toggleRunning} />
 * </TogglePillGroup>
 * ```
 */
import React, { createContext, useContext } from "react"
import { resolveInteractionTreatment, togglePillSurface } from "@silvery/ag"
import { useInteractionTreatment } from "../../hooks/useInteractionTreatment"
import { useHover } from "../../hooks/useHover"
import { Box } from "../../components/Box"
import type { BoxProps } from "../../components/Box"
import { Text } from "../../components/Text"

// =============================================================================
// Group-hover context
// =============================================================================

/** True when the enclosing TogglePillGroup is hovered. */
const TogglePillGroupContext = createContext<boolean>(false)

// =============================================================================
// Colour ladder
// =============================================================================

/**
 * Three-state colour ladder (idle → group-hover → item-hover), mirroring ag
 * code's `bottomBarToggleColor`. An idle inactive pill sits at the extra-muted
 * border tone; an idle active pill sits at `$fg`, measured against the idle
 * inactive tone at 3.60:1 on the default dark theme and 2.35:1 on the default
 * light theme (`$fg-muted` measured 1.56:1 and 1.13:1, too close to "off" to
 * read at rest). Hovering the group lifts active pills into `activeColor` (a
 * visible step when a caller passes one other than `$fg`), and the pill under
 * the pointer reaches `activeHoverColor` with a hover background.
 * Inactive pills only ever brighten to `$fg-muted`, so "on" always reads
 * brighter than "off".
 */
interface TogglePillTreatmentInput {
  active: boolean
  groupHovered: boolean
  itemHovered: boolean
  activeColor: string
  activeHoverColor: string
  /** Colour when active and nothing is hovered; `$fg` when omitted. */
  idleActiveColor?: string
}

export function togglePillColor(input: TogglePillTreatmentInput): string {
  const color = resolveTogglePillTreatment(input).color
  if (color === undefined) throw new Error("TogglePill treatment must provide a foreground")
  return color
}

function resolveTogglePillTreatment({
  active,
  groupHovered,
  itemHovered,
  activeColor,
  activeHoverColor,
  idleActiveColor,
}: TogglePillTreatmentInput) {
  const surface = togglePillSurface(
    active,
    itemHovered,
    activeColor,
    activeHoverColor,
    idleActiveColor,
  )
  return resolveInteractionTreatment(
    {
      hovered: groupHovered || itemHovered,
      armed: false,
      selected: active,
      focused: false,
      dropTarget: false,
    },
    "control",
    surface,
  )
}

// =============================================================================
// TogglePill
// =============================================================================

export interface TogglePillProps extends Omit<BoxProps, "children" | "onClick"> {
  /** Pill text (e.g. `"pending"`). Always rendered, so the row never reflows. */
  label: string
  /**
   * Render the label's first character bold — e.g. to surface a `p`/`r`/`f`/`d`
   * hotkey hint inside a plain word (`**p**ending`) without brackets. The bold
   * weight never changes the cell count, so hover/toggle still never reflows.
   * Default `false`.
   */
  boldFirstLetter?: boolean
  /** Whether the pill is toggled on. */
  active: boolean
  /** Called when the pill is clicked. */
  onToggle: () => void
  /** Colour when active and the group is hovered. Default `$fg`. */
  activeColor?: string
  /** Brighter colour when active and the pill itself is hovered. Default `$fg-accent`. */
  activeHoverColor?: string
  /**
   * Colour when active and nothing is hovered. Default `$fg`, measured against an inactive pill at 3.60:1 (default dark)
   * and 2.35:1 (default light); pass a colour when the active state must carry meaning at rest (a costlier mode, for
   * example).
   */
  idleActiveColor?: string
}

/**
 * A single clickable toggle pill. Reads group-hover state from the nearest
 * `TogglePillGroup`; used standalone it is simply never group-hovered.
 */
export function TogglePill({
  label,
  boldFirstLetter = false,
  active,
  onToggle,
  activeColor = "$fg",
  activeHoverColor = "$fg-accent",
  idleActiveColor,
  ...rest
}: TogglePillProps): React.ReactElement {
  const hover = useHover()
  const groupHovered = useContext(TogglePillGroupContext)
  const treatment = resolveTogglePillTreatment({
    active,
    groupHovered,
    itemHovered: hover.isHovered,
    activeColor,
    activeHoverColor,
    ...(idleActiveColor === undefined ? {} : { idleActiveColor }),
  })
  return (
    <Box
      flexDirection="row"
      flexShrink={0}
      minWidth={0}
      onClick={onToggle}
      onMouseEnter={hover.onMouseEnter}
      onMouseLeave={hover.onMouseLeave}
      backgroundColor={treatment.backgroundColor}
      {...rest}
    >
      {boldFirstLetter && label.length > 0 ? (
        <>
          <Text color={treatment.color} bold>
            {label.slice(0, 1)}
          </Text>
          <Text color={treatment.color}>{label.slice(1)}</Text>
        </>
      ) : (
        <Text color={treatment.color}>{label}</Text>
      )}
    </Box>
  )
}

// =============================================================================
// TogglePillGroup
// =============================================================================

export interface TogglePillGroupProps extends Omit<BoxProps, "children"> {
  /** Optional leading label, rendered at the same dim idle tone as the pills. */
  label?: string
  /** The `TogglePill`s. */
  children: React.ReactNode
  /** Gap between the label and pills. Default 1. */
  gap?: number
}

/**
 * Row wrapper that tracks group hover and shares it with its `TogglePill`
 * children through context, so the whole cluster lifts out of its dim idle
 * state together. Renders an optional leading label at the pill idle tone.
 */
export function TogglePillGroup({
  label,
  children,
  gap = 1,
  ...rest
}: TogglePillGroupProps): React.ReactElement {
  const interaction = useInteractionTreatment("control", "toggleGroup")
  return (
    <TogglePillGroupContext.Provider value={interaction.isHovered}>
      <Box
        flexDirection="row"
        flexShrink={0}
        minWidth={0}
        gap={gap}
        onMouseEnter={interaction.onMouseEnter}
        onMouseLeave={interaction.onMouseLeave}
        {...rest}
      >
        {label !== undefined && <Text color={interaction.treatment.color}>{label}</Text>}
        {children}
      </Box>
    </TogglePillGroupContext.Provider>
  )
}
