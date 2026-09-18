/**
 * Typography Preset Components
 *
 * Semantic text hierarchy for TUIs. Since terminals can't vary font size,
 * these presets use color + bold/dim/italic to create clear visual levels.
 *
 * All components accept an optional `color` prop to override the default.
 * Headings default to semantic theme colors; pass a custom color for
 * panel differentiation (e.g., <H1 color="$fg-success">Panel A</H1>).
 *
 * ## Color inheritance
 *
 * H3 inherits foreground; body and inline emphasis use theme variants.
 * An explicit color or structural style priority overrides those defaults.
 *
 * `Box theme={}` auto-inherits `$fg` for all text and auto-fills `$bg`:
 * ```tsx
 * <Box theme={lightTheme}>
 *   <P>This text uses the light theme's body foreground on its bg</P>
 * </Box>
 * ```
 *
 * Lists support nesting via UL/OL containers:
 * ```tsx
 * <UL>
 *   <LI>First item</LI>
 *   <LI>Second item
 *     <UL>
 *       <LI>Nested bullet</LI>
 *     </UL>
 *   </LI>
 * </UL>
 * ```
 */
import type { ReactNode } from "react"
import { createContext, useContext, Children, cloneElement, isValidElement } from "react"
import type { InteractionSurfaceInput, InteractionTreatment, InteractiveState } from "@silvery/ag"
import type { TerminalSelectionState } from "@silvery/ag-term"
import { Box, type BoxProps } from "../../components/Box"
import { Text } from "../../components/Text"
import type { TextProps } from "../../components/Text"
import { useInteractionTreatment } from "../../hooks/useInteractionTreatment"
import { useTheme } from "../../ThemeContext"
import { CapabilityRegistryContext } from "../../context"
import { StylePriorityContext, StylePriorityProvider } from "../../style-priority"
import { useExpansion } from "./use-expansion"
import { HangingMarkerRow } from "./HeadingRow"

export interface TypographyProps extends Omit<TextProps, "children"> {
  children?: ReactNode
}

type RegionInteraction =
  | { interactionSurface?: never; interactionTreatment?: never; interactionState?: never }
  | {
      interactionSurface: InteractionSurfaceInput
      interactionTreatment?: never
      interactionState?: Partial<Omit<InteractiveState, "hovered">>
    }
  | {
      interactionSurface?: never
      interactionTreatment: InteractionTreatment
      interactionState?: never
    }

export type DecoratedRegionProps = Omit<BoxProps, "children"> &
  RegionInteraction & { children?: ReactNode; railColor?: string; treatContent?: boolean }

// ============================================================================
// Headings
// ============================================================================

function Heading({
  variant,
  children,
  color,
  ...rest
}: TypographyProps & { readonly variant: NonNullable<TypographyProps["variant"]> }) {
  const theme = useTheme()
  const foreground = color ?? theme.variants?.[variant]?.color
  return (
    <Text variant={variant} color={color} {...rest}>
      <StylePriorityProvider foreground={foreground}>{children}</StylePriorityProvider>
    </Text>
  )
}

/** Page title — $fg-accent + bold. Maximum emphasis. */
export function H1({ children, color, ...rest }: TypographyProps) {
  return <Heading variant="h1" children={children} color={color} {...rest} />
}

/** Section heading — H1's color blended halfway toward foreground, plus bold. */
export function H2({ children, color, ...rest }: TypographyProps) {
  return <Heading variant="h2" children={children} color={color} {...rest} />
}

/** Group heading — bold, no color override. Same hue as theme's primary but no bold means lighter weight than H1. */
export function H3({ children, color, ...rest }: TypographyProps) {
  return <Heading variant="h3" children={children} color={color} {...rest} />
}

/** Sub-group heading — bold + $fg-muted. Recedes from H3. */
export function H4({ children, color, ...rest }: TypographyProps) {
  return <Heading variant="h4" children={children} color={color} {...rest} />
}

/** Minor heading — italic + $fg-muted. A step further down the hierarchy. */
export function H5({ children, color, ...rest }: TypographyProps) {
  return <Heading variant="h5" children={children} color={color} {...rest} />
}

/** Deepest heading — $fg-muted + dim. Minimum weight before body text. */
export function H6({ children, color, ...rest }: TypographyProps) {
  return <Heading variant="h6" children={children} color={color} {...rest} />
}

// ============================================================================
// Body Text
// ============================================================================

/** Paragraph — the theme's body foreground, with optional caller override. */
export function P({ children, color, ...rest }: TypographyProps) {
  return (
    <Text variant="body" color={color} {...rest}>
      {children}
    </Text>
  )
}

/** Introductory/lead text — $fg-muted + italic. Slightly elevated, slightly receded. */
export function Lead({ children, color, ...rest }: TypographyProps) {
  return (
    <Text variant="body-muted" italic color={color} {...rest}>
      {children}
    </Text>
  )
}

/** Secondary/supporting text — $fg-muted. Recedes from body text. */
export function Muted({ children, color, ...rest }: TypographyProps) {
  return (
    <Text variant="body-muted" color={color} {...rest}>
      {children}
    </Text>
  )
}

/** Fine print — $fg-muted + dim. Captions, footnotes, text that recedes even more than Muted. */
export function Small({ children, color, ...rest }: TypographyProps) {
  return (
    <Text variant="fine-print" color={color} {...rest}>
      {children}
    </Text>
  )
}

/** Bold emphasis — halfway between body foreground and the theme's full foreground. */
export function Strong({ children, color, ...rest }: TypographyProps) {
  return (
    <Text variant="strong" color={color} {...rest}>
      {children}
    </Text>
  )
}

/** Italic emphasis — halfway between body foreground and the theme's full foreground. */
export function Em({ children, color, ...rest }: TypographyProps) {
  return (
    <Text variant="em" color={color} {...rest}>
      {children}
    </Text>
  )
}

// ============================================================================
// Inline Elements
// ============================================================================

/**
 * Inline code — muted/link foreground blend without a background chip or padding.
 * An explicit caller color still wins (for selection and local emphasis).
 * Defaults to `wrap="truncate-middle"` (GitHub-style):
 * inline code is one unbroken token, so when it overflows the container
 * we keep the start and end visible (`getPolygonInt…rBand`) instead of
 * wrapping mid-identifier. Callers can override via the spread `wrap=…`
 * prop. Tracking: @km/silvery/15086-inline-code-nowrap-default.
 */
export function Code({ children, color, ...rest }: TypographyProps) {
  return (
    <Text variant="code" color={color} wrap="truncate-middle" {...rest}>
      {children}
    </Text>
  )
}

/** Keyboard shortcut badge — $bg-muted background + bold. Inherits foreground from parent. */
export function Kbd({ children, color, ...rest }: TypographyProps) {
  return (
    <Text variant="kbd" color={color} {...rest}>
      {" "}
      {children}{" "}
    </Text>
  )
}

// ============================================================================
// Block Elements
// ============================================================================

/**
 * A region with a structural left rail. The rail is layout chrome rather than
 * a text prefix, so it spans authored and wrapped rows alike.
 */
export function DecoratedRegion({
  children,
  railColor = "$border-default",
  treatContent = true,
  interactionSurface,
  interactionTreatment,
  interactionState,
  onMouseEnter,
  onMouseLeave,
  color,
  backgroundColor,
  bold,
  mouseCursor,
  ...props
}: DecoratedRegionProps) {
  const interaction = useInteractionTreatment(
    "region",
    interactionSurface ?? "bare",
    interactionSurface !== undefined,
    interactionState,
  )
  if (interactionSurface !== undefined && interactionTreatment !== undefined) {
    throw new Error("DecoratedRegion accepts interactionSurface or interactionTreatment, not both")
  }
  if (interactionState !== undefined && interactionSurface === undefined) {
    throw new Error("DecoratedRegion interactionState requires interactionSurface")
  }
  if (interactionTreatment !== undefined && interactionTreatment.extent !== "gutter") {
    throw new Error("DecoratedRegion requires an external regional treatment with gutter extent")
  }
  const treatment = interactionTreatment ?? interaction.treatment
  const treatedRailColor =
    treatment.extent === "gutter" ? (treatment.gutterColor ?? railColor) : railColor
  const contentTreatment = treatContent ? treatment : undefined
  const enter: BoxProps["onMouseEnter"] =
    interactionSurface === undefined
      ? onMouseEnter
      : (event) => {
          interaction.onMouseEnter(event)
          onMouseEnter?.(event)
        }
  const leave: BoxProps["onMouseLeave"] =
    interactionSurface === undefined
      ? onMouseLeave
      : (event) => {
          onMouseLeave?.(event)
          interaction.onMouseLeave(event)
        }

  return (
    <Box
      flexShrink={1}
      minWidth={0}
      paddingLeft={1}
      borderStyle="hairline"
      borderColor={treatedRailColor}
      borderTop={false}
      borderBottom={false}
      borderRight={false}
      color={color ?? contentTreatment?.color}
      backgroundColor={backgroundColor ?? contentTreatment?.backgroundColor}
      bold={bold ?? contentTreatment?.bold}
      mouseCursor={mouseCursor ?? treatment.mouseCursor}
      onMouseEnter={enter}
      onMouseLeave={leave}
      {...props}
    >
      {children}
    </Box>
  )
}

/** Blockquote — italic muted prose inset two cells, without structural chrome. */
export function Blockquote({ children, color }: TypographyProps) {
  const muted = color ?? "$fg-muted"
  return (
    <Box marginLeft={2} minWidth={0}>
      <Text color={muted} italic wrap="wrap">
        {children}
      </Text>
    </Box>
  )
}

/**
 * Code block — subtle surface with two-cell sides and one-row vertical padding.
 * Document layouts can outdent this surface to align its code with prose.
 * Distinct from Blockquote. Body Text defaults to `wrap="hard"` (CSS
 * `word-break: break-all`): long code lines wrap mid-identifier at
 * the column boundary rather than spilling off the right edge. Code
 * fences in a narrow terminal stay fully visible. Tracking:
 * @km/silvery/15087-markdown-code-block-char-wrap-default.
 */
export interface CodeBlockProps extends Omit<BoxProps, "children" | "content"> {
  children?: ReactNode
  /** Already-rendered source, such as a bare SyntaxHighlighter. */
  content?: ReactNode
  label?: string
  expanded?: boolean
  defaultExpanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
}

export function CodeBlock({
  children,
  content,
  label = "text",
  expanded,
  defaultExpanded = true,
  onExpandedChange,
  color,
  backgroundColor,
  onClick,
  onMouseEnter,
  onMouseLeave,
  ...props
}: CodeBlockProps) {
  const [isExpanded, setExpanded] = useExpansion(expanded, defaultExpanded, onExpandedChange)
  const interaction = useInteractionTreatment("control", "surfaceHover")
  const priority = useContext(StylePriorityContext)
  const registry = useContext(CapabilityRegistryContext)
  const background =
    priority?.background ??
    backgroundColor ??
    (!isExpanded && interaction.isHovered ? "$bg-surface-hover" : "$bg-surface-subtle")
  const labelColor = "mix($fg-faint, $bg, 50%)"
  return (
    <Box
      flexDirection="column"
      position="relative"
      width="100%"
      minWidth={0}
      paddingX={2}
      {...props}
      paddingY={isExpanded ? 1 : 0}
      color={color}
      backgroundColor={background}
      mouseCursor="pointer"
      onMouseEnter={(event) => {
        interaction.onMouseEnter(event)
        onMouseEnter?.(event)
      }}
      onMouseLeave={(event) => {
        interaction.onMouseLeave(event)
        onMouseLeave?.(event)
      }}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        // The runtime consumes drag releases. Also leave an existing text
        // selection intact rather than interpreting it as a disclosure click.
        const selection = registry?.get<{ readonly state: TerminalSelectionState }>(
          Symbol.for("silvery.selection"),
        )?.state
        const range = selection?.range
        if (
          selection?.selecting ||
          (range && (range.anchor.col !== range.head.col || range.anchor.row !== range.head.row))
        ) {
          return
        }
        setExpanded(!isExpanded)
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <StylePriorityProvider background={background}>
        {isExpanded ? (
          <>
            {interaction.isHovered ? (
              <Box position="absolute" top={0} right={2}>
                <Text color={labelColor}>{label}</Text>
              </Box>
            ) : null}
            {content ?? (
              <Text color={color ?? "mix($fg, $fg-muted, 50%)"} wrap="hard">
                {children}
              </Text>
            )}
          </>
        ) : (
          <HangingMarkerRow marker={<Text color="$fg-faint">▸</Text>}>
            <Text color="$fg-muted">{label}</Text>
          </HangingMarkerRow>
        )}
      </StylePriorityProvider>
    </Box>
  )
}

/**
 * Widest rule we ever draw, in columns. Past this the rule stops tracking the
 * container: on a wide terminal a full-bleed rule reads as a page divider
 * rather than a break between paragraphs.
 */
const RULE_MAX_WIDTH = 60

/** Fraction of the container the rule spans below the cap. */
const RULE_WIDTH = "67%"

/**
 * Oversized fill, clipped to the box. Long enough that the rule is solid at any
 * terminal width; never a width calculation, which is what `RULE_WIDTH` and the
 * layout engine are for.
 */
const RULE_FILL = "─".repeat(200)

/**
 * Thematic break — a centred rule with an inset measure.
 *
 * ## Two rules, both learned the hard way
 *
 * `wrap="clip"`, never `"truncate"` — CHROME IS CLIPPED, PROSE IS TRUNCATED.
 * U+2026 is a claim that content was cut off; a rule carries zero characters,
 * so appending one makes the render lie about the document. `clip` cuts the
 * fill without making that claim. Any chrome drawn as repeat-a-glyph inherits
 * this: it is filler to be clipped, not content to be truncated.
 *
 * The width is `min(67%, 60)`, expressed as `width` + `maxWidth` because that
 * is CSS's own decomposition of `min()` — and because the engine does not honor
 * `min()`/`calc()` through the `width` prop (measured: bare `50%` applies,
 * `calc(50%)` is ignored and the element goes full-bleed). Do not "simplify"
 * this pair back into a `min()` string; it silently becomes no constraint at
 * all. Percent also keeps this working under `SILVERY_ENGINE=yoga`, which the
 * `cqi` container-query form would not — `containerType` throws at first paint
 * there, and yoga is the documented way to isolate a rendering bug.
 *
 * Auto inline margins centre the measure so the rule reads as a thematic
 * division, not as an underline attached to the preceding prose. `alignSelf`
 * is not the equivalent here: DocumentView's BlockFrame is a row, so its cross
 * axis is vertical. Fractional slack is distributed by the layout engine; the
 * two margins therefore differ by at most one column.
 *
 * Widths are the engine's, which ROUNDS rather than floors (0.67 × 80 = 53.6
 * draws 54). Monotonic across 10..120 columns regardless, so the rule never
 * shrinks as a pane widens — no jitter on resize. Pinned by test, since that
 * is a property of the engine's rounding and not of this component.
 *
 * Beads: @km/tui/22744-hr-truncated-in-prose-lane
 */
export function HR({ color, ...rest }: Omit<TypographyProps, "children">) {
  return (
    <Box width={RULE_WIDTH} maxWidth={RULE_MAX_WIDTH} marginLeft="auto" marginRight="auto">
      <Text color={color ?? "$border-muted"} wrap="clip" {...rest}>
        {RULE_FILL}
      </Text>
    </Box>
  )
}

// ============================================================================
// Lists
// ============================================================================

interface ListContextValue {
  level: number
  ordered: boolean
}

const ListContext = createContext<ListContextValue>({ level: 0, ordered: false })

/** Unordered list container. Nest inside another UL/OL for indented sub-lists. */
export function UL({ children }: TypographyProps) {
  const parent = useContext(ListContext)
  return (
    <ListContext.Provider value={{ level: parent.level + 1, ordered: false }}>
      <Box flexDirection="column">{children}</Box>
    </ListContext.Provider>
  )
}

/** Ordered list container. Auto-numbers LI children. Nest for sub-lists. */
export function OL({ children }: TypographyProps) {
  const parent = useContext(ListContext)
  let index = 0
  const numbered = Children.map(children, (child) => {
    if (isValidElement(child) && child.type === LI) {
      index++
      return cloneElement(child as React.ReactElement<{ _index?: number }>, { _index: index })
    }
    return child
  })
  return (
    <ListContext.Provider value={{ level: parent.level + 1, ordered: true }}>
      <Box flexDirection="column">{numbered}</Box>
    </ListContext.Provider>
  )
}

/** List item with hanging indent. Use inside UL or OL. 2-char marker (bullet + space). */
export function LI({ children, color, _index }: TypographyProps & { _index?: number }) {
  const { level, ordered } = useContext(ListContext)
  const effectiveLevel = Math.max(level, 1)
  const indent = "  ".repeat(effectiveLevel - 1)
  const marker = ordered && _index != null ? `${_index}. ` : "• "

  return (
    <Box>
      <Text color={color ?? "$fg-muted"}>
        {indent}
        {marker}
      </Text>
      <Box flexShrink={1}>
        <P color={color}>{children}</P>
      </Box>
    </Box>
  )
}
