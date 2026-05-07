/**
 * React Reconciler Host Config
 *
 * Defines how React creates, updates, and manages SilveryNodes.
 * This is the bridge between React's reconciliation algorithm
 * and our custom terminal node tree.
 */

// Module declarations for "react-reconciler/constants.js" live in ../react-reconciler.d.ts
// (picked up via tsconfig `include` glob).

import { createContext } from "react"
import {
  DefaultEventPriority,
  DiscreteEventPriority,
  NoEventPriority,
} from "react-reconciler/constants.js"
import { reportDisposeError, type Scope } from "@silvery/scope"
import type { BoxProps, AgNode, AgNodeType, TextProps } from "@silvery/ag/types"
import {
  trackContentDirty,
  trackStyleOnlyDirty,
  trackScrollDirty,
} from "@silvery/ag/dirty-tracking"
import { syncTextContentSignal } from "@silvery/ag/layout-signals"
import {
  getRenderEpoch,
  INITIAL_EPOCH,
  isDirty,
  setDirtyBit,
  CONTENT_BIT,
  STYLE_PROPS_BIT,
  BG_BIT,
  CHILDREN_BIT,
  SUBTREE_BIT,
  ALL_RECONCILER_BITS,
} from "@silvery/ag/epoch"
import { classifyPropChanges } from "./helpers"
import { applyBoxProps, applyTextFlexItemProps, createNode, createVirtualTextNode } from "./nodes"
import { createLogger } from "loggily"
import { warnOnce, _resetWarnOnceForTesting } from "@silvery/ansi"

const log = createLogger("silvery:reconciler")

/**
 * Normalize Ink intrinsic element types to Silvery equivalents.
 * Ink uses `ink-box` / `ink-text` as intrinsic element names;
 * Silvery uses `silvery-box` / `silvery-text`.
 */
function normalizeNodeType(type: string): AgNodeType {
  if (type === "ink-box") return "silvery-box"
  if (type === "ink-text") return "silvery-text"
  return type as AgNodeType
}

// ============================================================================
// Node Removal Hook
// ============================================================================

/**
 * Callback invoked when a node is removed from the tree.
 * Used by the app layer to coordinate focus cleanup — if the focused element
 * is within a removed subtree, focus must be cleared to prevent dangling
 * references and broken navigation (indexOf → -1, hasFocusWithin lies).
 */
let onNodeRemovedCallback: ((removedNode: AgNode) => void) | null = null

/**
 * Register a callback to be called when any node is removed from the tree.
 * Returns a cleanup function to unregister. Only one callback at a time.
 */
export function setOnNodeRemoved(callback: ((removedNode: AgNode) => void) | null): void {
  onNodeRemovedCallback = callback
}

// ============================================================================
// Fiber-Local Scope Slot
// ============================================================================
//
// Every host instance (AgNode) gets an optional Scope slot — kept off the
// AgNode shape itself so that @silvery/ag stays free of an upward
// dependency on @silvery/scope. The slot is owned by the reconciler:
//
//   - hooks (useScope) attach a fiber-local scope on first access via
//     `attachNodeScope`,
//   - the unmount paths below (removeChild, removeChildFromContainer,
//     clearContainer, detachDeletedInstance) walk the doomed subtree and
//     fire-and-forget `scope[Symbol.asyncDispose]()`,
//   - any rejection routes through `reportDisposeError(error, { phase:
//     "react-unmount", scope })`. Disposal is unavoidable — there is no
//     path that swallows the slot without disposing.
//
// A WeakMap means a node that's eligible for GC drops its scope reference
// even if the dispose was already kicked off; the dispose itself keeps the
// scope alive for the duration of the teardown via its own closures.

// Module-instance-shared via globalThis so duplicate module copies (e.g. when
// tests import host-config relatively while the renderer imports it through
// the @silvery/ag-react/reconciler symlink) all see the same per-node scope
// table. Without this, two module copies hold two independent WeakMaps and
// fiber-scope disposal silently no-ops because the dispose path's WeakMap is
// not the one the consumer attached to.
const NODE_SCOPES_KEY = Symbol.for("@silvery/ag-react/reconciler/nodeScopes")
type NodeScopesRegistry = WeakMap<AgNode, Scope>
const nodeScopes: NodeScopesRegistry =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- globalThis registry
  (globalThis as any)[NODE_SCOPES_KEY] ??
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((globalThis as any)[NODE_SCOPES_KEY] = new WeakMap<AgNode, Scope>())

/**
 * Attach a fiber-local scope to a host instance. Called from `useScope` /
 * `useScopeEffect` when a component first asks for a scope. Idempotent
 * within a single mount: replacing an attached scope without first
 * disposing it would leak the predecessor, so this throws instead.
 */
export function attachNodeScope(node: AgNode, scope: Scope): void {
  const existing = nodeScopes.get(node)
  if (existing && existing !== scope) {
    throw new Error(
      "attachNodeScope: node already has a different scope attached. " +
        "Detach (or dispose) the existing scope before attaching another.",
    )
  }
  nodeScopes.set(node, scope)
}

/** Read the fiber-local scope (or `undefined`) for a host instance. */
export function getNodeScope(node: AgNode): Scope | undefined {
  return nodeScopes.get(node)
}

/**
 * Detach the slot without disposing — used by hooks whose own
 * `useEffect` cleanup ran first (so the scope is already disposed and the
 * unmount path must not double-dispose).
 */
export function detachNodeScope(node: AgNode): Scope | undefined {
  const scope = nodeScopes.get(node)
  if (scope) nodeScopes.delete(node)
  return scope
}

/**
 * Dispose any scope attached to `node` and to every descendant. Called
 * from the reconciler's unmount paths. Fire-and-forget per the design
 * contract: react commit is synchronous, scope dispose is async, so we
 * kick off the promise and route rejections through `reportDisposeError`.
 *
 * Walks the subtree synchronously so all slots are detached *before* any
 * dispose promise resolves — this prevents a re-entrant render from
 * observing a partially torn-down tree with live scope slots.
 */
export function disposeSubtreeScopes(node: AgNode): void {
  // Detach first, dispose second — so an exception in dispose doesn't
  // leave the slot pointing at a half-disposed scope.
  const scope = nodeScopes.get(node)
  if (scope) {
    nodeScopes.delete(node)
    void scope[Symbol.asyncDispose]().catch((error) =>
      reportDisposeError(error, { phase: "react-unmount", scope }),
    )
  }
  for (const child of node.children) {
    disposeSubtreeScopes(child)
  }
}

// ============================================================================
// Subtree Dirty Propagation
// ============================================================================

/**
 * Mark this node and all ancestors as having dirty content/layout.
 * Used to enable fast-path subtree skipping in renderPhase.
 */
function markSubtreeDirty(node: AgNode | null): void {
  const epoch = getRenderEpoch()
  while (node && !isDirty(node.dirtyBits, node.dirtyEpoch, SUBTREE_BIT)) {
    if (node.dirtyEpoch !== epoch) {
      node.dirtyBits = SUBTREE_BIT
      node.dirtyEpoch = epoch
    } else {
      node.dirtyBits |= SUBTREE_BIT
    }
    node = node.parent
  }
}

/**
 * When a child change (append/remove/insert/text-update) occurs inside a
 * virtual text subtree (no layoutNode), the nearest layout ancestor must be
 * notified so its measure function re-collects descendant text and the layout
 * engine recalculates dimensions. Without this, the measure cache stays stale
 * and renderPhase renders at the wrong size / doesn't clear old content.
 *
 * No-op when the node already has a layoutNode (normal path handles it).
 */
function markLayoutAncestorDirty(node: AgNode): void {
  if (node.layoutNode) return
  let ancestor: AgNode | null = node.parent
  while (ancestor && !ancestor.layoutNode) {
    ancestor = ancestor.parent
  }
  if (ancestor?.layoutNode) {
    const epoch = getRenderEpoch()
    if (ancestor.dirtyEpoch !== epoch) {
      ancestor.dirtyBits = CONTENT_BIT | STYLE_PROPS_BIT
      ancestor.dirtyEpoch = epoch
    } else {
      ancestor.dirtyBits |= CONTENT_BIT | STYLE_PROPS_BIT
    }
    ancestor.layoutNode.markDirty()
    trackContentDirty(ancestor)
  }
}

// ============================================================================
// Dev Warnings
// ============================================================================
//
// Box-inside-Text warning uses the shared `warnOnce` latch from @silvery/ansi
// (see km-silvery.latch-consolidation). Tests reset via
// `_resetWarnOnceForTesting("silvery/ag-react:box-in-text")`.

const BOX_INSIDE_TEXT_WARNING_ID = "silvery/ag-react:box-in-text"

/**
 * Reset the box-inside-text warning latch (for testing).
 * Thin wrapper over `_resetWarnOnceForTesting` that pins the warning ID —
 * call sites don't need to remember the exact key.
 */
export function _resetBoxInsideTextWarning(): void {
  _resetWarnOnceForTesting(BOX_INSIDE_TEXT_WARNING_ID)
}

/**
 * Ink-compatible strict validation mode.
 * When enabled, the reconciler throws errors instead of warnings for:
 * - Raw text directly inside a Box (must be inside Text)
 * - Box nested inside Text
 */
let inkStrictValidation = false

/** Enable/disable Ink-compatible strict validation. */
export function setInkStrictValidation(enabled: boolean): void {
  inkStrictValidation = enabled
}

// ============================================================================
// Types
// ============================================================================

/**
 * Container type - the root of our Silvery tree
 */
export interface Container {
  root: AgNode
  onRender: () => void
}

/**
 * Host context tracks whether we're inside a Text component
 */
interface HostContext {
  isInsideText: boolean
}

// ============================================================================
// Update Priority Management (for react-reconciler 0.33+)
// ============================================================================

let currentUpdatePriority = NoEventPriority

/**
 * Run a callback with DiscreteEventPriority so React treats state
 * updates inside it as user-interaction priority (synchronous commit).
 * Use this for keyboard input handling to prevent React's concurrent
 * scheduler from deferring the commit.
 */
export function runWithDiscreteEvent(fn: () => void): void {
  const prev = currentUpdatePriority
  currentUpdatePriority = DiscreteEventPriority
  try {
    fn()
  } finally {
    currentUpdatePriority = prev
  }
}

// ============================================================================
// Host Config
// ============================================================================

/**
 * The React Reconciler host config.
 * This defines how React creates, updates, and manages our custom SilveryNodes.
 */
export const hostConfig = {
  // Renderer identity (used by React DevTools to identify this renderer)
  rendererPackageName: "@silvery/ag-react",
  rendererVersion: "0.0.1",

  // Feature flags
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: true,

  // Scheduling
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  supportsMicrotasks: true,
  scheduleMicrotask: queueMicrotask,

  // Context - tracks whether we're inside a Text component
  getRootHostContext(): HostContext {
    return { isInsideText: false }
  },

  getChildHostContext(parentHostContext: HostContext, type: AgNodeType): HostContext {
    // Normalize Ink intrinsic types (ink-box → silvery-box, ink-text → silvery-text)
    const normalizedType = normalizeNodeType(type)
    // Once inside a text node, stay inside
    const isInsideText = parentHostContext.isInsideText || normalizedType === "silvery-text"
    if (isInsideText === parentHostContext.isInsideText) {
      return parentHostContext
    }
    return { isInsideText }
  },

  // Instance creation
  createInstance(
    type: AgNodeType,
    props: BoxProps | TextProps,
    _rootContainer: unknown,
    hostContext: HostContext,
  ): AgNode {
    // Normalize Ink intrinsic types (ink-box → silvery-box, ink-text → silvery-text)
    type = normalizeNodeType(type)
    // Ink-compat: flatten `style` prop from intrinsic ink-box/ink-text elements.
    // Ink's intrinsic elements use `<ink-box style={{marginLeft: 1}}>` where the
    // style object contains layout props. Silvery expects them as top-level props.
    if ("style" in props && props.style && typeof props.style === "object") {
      props = { ...props.style, ...props } as BoxProps | TextProps
    }
    // Ink-compat: throw when a Box is nested inside a Text
    if (type === "silvery-box" && hostContext.isInsideText) {
      if (inkStrictValidation) {
        throw new Error("<Box> can\u2019t be nested inside <Text> component")
      }
      if (process.env.NODE_ENV !== "production") {
        warnOnce(BOX_INSIDE_TEXT_WARNING_ID, () =>
          log.warn?.(
            "<Box> cannot be nested inside <Text>. This produces undefined layout behavior.",
          ),
        )
      }
    }

    // Nested text nodes become "virtual" - no layout node
    if (type === "silvery-text" && hostContext.isInsideText) {
      return createVirtualTextNode(props as TextProps)
    }
    return createNode(type, props)
  },

  createTextInstance(text: string, _rootContainer: unknown, hostContext: HostContext): AgNode {
    // Ink-compat: throw when text appears directly in a Box (outside Text)
    if (inkStrictValidation && !hostContext.isInsideText && text.trim().length > 0) {
      throw new Error(`Text string "${text}" must be rendered inside <Text> component`)
    }
    // Raw text nodes don't have layout nodes - they're just data nodes
    // Their content is rendered by their parent silvery-text element
    const epoch = getRenderEpoch()
    const node: AgNode = {
      type: "silvery-text",
      props: { children: text } as TextProps,
      children: [],
      parent: null,
      layoutNode: null, // No layout node for raw text
      boxRect: null,
      scrollRect: null,
      screenRect: null,
      prevLayout: null,
      prevScrollRect: null,
      prevScreenRect: null,
      layoutChangedThisFrame: INITIAL_EPOCH,
      dirtyBits: CONTENT_BIT | STYLE_PROPS_BIT | BG_BIT | SUBTREE_BIT,
      dirtyEpoch: epoch,
      textContent: text,
      isRawText: true,
    }
    return node
  },

  // Tree operations
  appendChild(parentInstance: AgNode, child: AgNode) {
    // React calls appendChild to move an existing child during keyed reorder.
    // Remove from old position first to avoid duplicating in the children array.
    const existingIndex = parentInstance.children.indexOf(child)
    if (existingIndex !== -1) {
      parentInstance.children.splice(existingIndex, 1)
      if (parentInstance.layoutNode && child.layoutNode) {
        parentInstance.layoutNode.removeChild(child.layoutNode)
      }
    }
    child.parent = parentInstance
    parentInstance.children.push(child)
    // Only add to layout tree if both nodes have layout nodes
    if (parentInstance.layoutNode && child.layoutNode) {
      // Count non-raw-text children for proper layout index
      const layoutIndex = parentInstance.children.filter((c) => c.layoutNode !== null).length - 1
      parentInstance.layoutNode.insertChild(child.layoutNode, layoutIndex)
    }
    {
      const epoch = getRenderEpoch()
      const bits = CHILDREN_BIT | CONTENT_BIT
      parentInstance.dirtyBits =
        parentInstance.dirtyEpoch !== epoch ? bits : parentInstance.dirtyBits | bits
      parentInstance.dirtyEpoch = epoch
    }
    parentInstance.layoutNode?.markDirty()
    trackContentDirty(parentInstance)
    markLayoutAncestorDirty(parentInstance)
    markSubtreeDirty(parentInstance)
  },

  appendInitialChild(parentInstance: AgNode, child: AgNode) {
    child.parent = parentInstance
    parentInstance.children.push(child)
    // Only add to layout tree if both nodes have layout nodes
    if (parentInstance.layoutNode && child.layoutNode) {
      const layoutIndex = parentInstance.children.filter((c) => c.layoutNode !== null).length - 1
      parentInstance.layoutNode.insertChild(child.layoutNode, layoutIndex)
    }
  },

  appendChildToContainer(container: Container, child: AgNode) {
    // Remove from old position if already a child (keyed reorder)
    const existingIndex = container.root.children.indexOf(child)
    if (existingIndex !== -1) {
      container.root.children.splice(existingIndex, 1)
      if (container.root.layoutNode && child.layoutNode) {
        container.root.layoutNode.removeChild(child.layoutNode)
      }
    }
    child.parent = container.root
    container.root.children.push(child)
    if (container.root.layoutNode && child.layoutNode) {
      const layoutIndex = container.root.children.filter((c) => c.layoutNode !== null).length - 1
      container.root.layoutNode.insertChild(child.layoutNode, layoutIndex)
    }
    {
      const epoch = getRenderEpoch()
      const bits = CHILDREN_BIT | CONTENT_BIT
      container.root.dirtyBits =
        container.root.dirtyEpoch !== epoch ? bits : container.root.dirtyBits | bits
      container.root.dirtyEpoch = epoch
    }
    container.root.layoutNode?.markDirty()
    trackContentDirty(container.root)
    markSubtreeDirty(container.root)
  },

  removeChild(parentInstance: AgNode, child: AgNode) {
    const index = parentInstance.children.indexOf(child)
    if (index !== -1) {
      // Notify focus manager before detaching (needs parent chain intact for subtree check)
      onNodeRemovedCallback?.(child)
      // Dispose any fiber-local scopes in the doomed subtree. Must happen
      // before we splice — disposeSubtreeScopes walks `child.children`,
      // and we want the walk to see the same tree the focus manager just
      // observed.
      disposeSubtreeScopes(child)
      parentInstance.children.splice(index, 1)
      if (parentInstance.layoutNode && child.layoutNode) {
        parentInstance.layoutNode.removeChild(child.layoutNode)
        child.layoutNode.free()
      }
      child.parent = null
      {
        const epoch = getRenderEpoch()
        const bits = CHILDREN_BIT | CONTENT_BIT
        parentInstance.dirtyBits =
          parentInstance.dirtyEpoch !== epoch ? bits : parentInstance.dirtyBits | bits
        parentInstance.dirtyEpoch = epoch
      }
      parentInstance.layoutNode?.markDirty()
      trackContentDirty(parentInstance)
      markLayoutAncestorDirty(parentInstance)
      markSubtreeDirty(parentInstance)
    }
  },

  removeChildFromContainer(container: Container, child: AgNode) {
    const index = container.root.children.indexOf(child)
    if (index !== -1) {
      // Notify focus manager before detaching
      onNodeRemovedCallback?.(child)
      disposeSubtreeScopes(child)
      container.root.children.splice(index, 1)
      if (container.root.layoutNode && child.layoutNode) {
        container.root.layoutNode.removeChild(child.layoutNode)
        child.layoutNode.free()
      }
      child.parent = null
      {
        const epoch = getRenderEpoch()
        const bits = CHILDREN_BIT | CONTENT_BIT
        container.root.dirtyBits =
          container.root.dirtyEpoch !== epoch ? bits : container.root.dirtyBits | bits
        container.root.dirtyEpoch = epoch
      }
      container.root.layoutNode?.markDirty()
      trackContentDirty(container.root)
      markSubtreeDirty(container.root)
    }
  },

  insertBefore(parentInstance: AgNode, child: AgNode, beforeChild: AgNode) {
    // React calls insertBefore to move an existing child during keyed reorder.
    // Remove from old position first to avoid duplicating in the children array.
    const existingIndex = parentInstance.children.indexOf(child)
    if (existingIndex !== -1) {
      parentInstance.children.splice(existingIndex, 1)
      if (parentInstance.layoutNode && child.layoutNode) {
        parentInstance.layoutNode.removeChild(child.layoutNode)
      }
    }
    const beforeIndex = parentInstance.children.indexOf(beforeChild)
    if (beforeIndex !== -1) {
      child.parent = parentInstance
      parentInstance.children.splice(beforeIndex, 0, child)
      if (parentInstance.layoutNode && child.layoutNode) {
        // Count non-raw-text children before this position for proper layout index
        const layoutIndex = parentInstance.children
          .slice(0, beforeIndex)
          .filter((c) => c.layoutNode !== null).length
        parentInstance.layoutNode.insertChild(child.layoutNode, layoutIndex)
      }
      {
        const epoch = getRenderEpoch()
        const bits = CHILDREN_BIT | CONTENT_BIT
        parentInstance.dirtyBits =
          parentInstance.dirtyEpoch !== epoch ? bits : parentInstance.dirtyBits | bits
        parentInstance.dirtyEpoch = epoch
      }
      parentInstance.layoutNode?.markDirty()
      trackContentDirty(parentInstance)
      markLayoutAncestorDirty(parentInstance)
      markSubtreeDirty(parentInstance)
    }
  },

  insertInContainerBefore(container: Container, child: AgNode, beforeChild: AgNode) {
    // Remove from old position if already a child (keyed reorder)
    const existingIndex = container.root.children.indexOf(child)
    if (existingIndex !== -1) {
      container.root.children.splice(existingIndex, 1)
      if (container.root.layoutNode && child.layoutNode) {
        container.root.layoutNode.removeChild(child.layoutNode)
      }
    }
    const beforeIndex = container.root.children.indexOf(beforeChild)
    if (beforeIndex !== -1) {
      child.parent = container.root
      container.root.children.splice(beforeIndex, 0, child)
      if (container.root.layoutNode && child.layoutNode) {
        const layoutIndex = container.root.children
          .slice(0, beforeIndex)
          .filter((c) => c.layoutNode !== null).length
        container.root.layoutNode.insertChild(child.layoutNode, layoutIndex)
      }
      {
        const epoch = getRenderEpoch()
        const bits = CHILDREN_BIT | CONTENT_BIT
        container.root.dirtyBits =
          container.root.dirtyEpoch !== epoch ? bits : container.root.dirtyBits | bits
        container.root.dirtyEpoch = epoch
      }
      container.root.layoutNode?.markDirty()
      trackContentDirty(container.root)
      markSubtreeDirty(container.root)
    }
  },

  // Updates
  prepareUpdate(
    _instance: AgNode,
    _type: AgNodeType,
    oldProps: BoxProps | TextProps,
    newProps: BoxProps | TextProps,
  ): boolean | null {
    // Return true if we need to update
    return classifyPropChanges(
      oldProps as Record<string, unknown>,
      newProps as Record<string, unknown>,
    ).anyChanged
  },

  // Note: react-reconciler 0.33+ changed the signature from
  // commitUpdate(instance, updatePayload, type, oldProps, newProps) to
  // commitUpdate(instance, type, oldProps, newProps, finishedWork)
  commitUpdate(
    instance: AgNode,
    _type: AgNodeType,
    oldProps: BoxProps | TextProps,
    newProps: BoxProps | TextProps,
    _finishedWork: unknown,
  ) {
    // Ink-compat: flatten `style` prop from intrinsic ink-box/ink-text elements
    if ("style" in oldProps && oldProps.style && typeof oldProps.style === "object") {
      oldProps = { ...oldProps.style, ...oldProps } as BoxProps | TextProps
    }
    if ("style" in newProps && newProps.style && typeof newProps.style === "object") {
      newProps = { ...newProps.style, ...newProps } as BoxProps | TextProps
    }

    // Single-pass prop classification — replaces 3 separate iterations
    // (propsEqual + layoutPropsChanged + contentPropsChanged)
    const { anyChanged, layoutChanged, contentChanged } = classifyPropChanges(
      oldProps as Record<string, unknown>,
      newProps as Record<string, unknown>,
    )

    // Early exit if props are equal (React may call commitUpdate even when nothing changed)
    if (!anyChanged) {
      instance.props = newProps
      return
    }

    // Apply layout-affecting prop changes
    if (layoutChanged) {
      if (instance.layoutNode) {
        if (instance.type === "silvery-text") {
          applyTextFlexItemProps(instance.layoutNode, newProps as TextProps, oldProps as TextProps)
        } else {
          applyBoxProps(instance.layoutNode, newProps as BoxProps, oldProps as BoxProps)
        }
        instance.layoutNode.markDirty()
      }
    }
    if (contentChanged) {
      const epoch = getRenderEpoch()
      // stylePropsDirty: always set for any visual change. Render phase uses this
      // to know the node needs re-rendering (border, text style, bg, etc.).
      let bits = STYLE_PROPS_BIT
      // contentDirty: only for text content changes (not style-only changes).
      // Style-only changes (borderColor, color, bold) set stylePropsDirty but NOT
      // contentDirty, so render phase won't cascade to children for border-only
      // changes where the content area is unchanged.
      if (contentChanged === "text") {
        bits |= CONTENT_BIT
        if (instance.layoutNode) {
          instance.layoutNode.markDirty()
        }
      }
      // bgDirty: specifically track backgroundColor changes (added/changed/removed).
      // Render phase uses this to cascade re-renders only when the content area
      // was actually affected (not for border-only paint changes).
      if (
        (oldProps as Record<string, unknown>).backgroundColor !==
        (newProps as Record<string, unknown>).backgroundColor
      ) {
        bits |= BG_BIT
      }
      // Border removal: when borderStyle goes from truthy to falsy, stale border
      // characters (╭╮╰╯│─) persist in the cloned buffer because renderBox doesn't
      // draw anything at those positions. Setting bgDirty makes contentAreaAffected
      // true, triggering clearNodeRegion to fill the area with inherited bg.
      // Border *addition* doesn't need this — renderBorder overwrites the old cells.
      if (
        (oldProps as Record<string, unknown>).borderStyle &&
        !(newProps as Record<string, unknown>).borderStyle
      ) {
        bits |= BG_BIT
      }
      // NOTE: outline removal does NOT need a dirty bit here — the decoration
      // phase walks every frame and clears previous outline cells from
      // per-cell snapshots. See pipeline/decoration-phase.ts.
      // Theme change: all descendants need re-rendering with new token values.
      // We set both CONTENT_BIT and BG_BIT so that bgOnlyAffected remains false
      // (bgOnlyAffected = bgDirty && !contentDirty && ...). Without CONTENT_BIT,
      // bgOnlyChange fires when the ThemeProvider Box has a theme.bg value
      // (hasBgColor=true via getEffectiveBg), and bgOnlyChange sets
      // childrenNeedFreshRender=false — children skip re-render and use stale
      // $token-resolved colors from the clone. CONTENT_BIT disables bgOnlyChange
      // and ensures childrenNeedFreshRender=true so children re-render with the
      // new pushContextTheme(newTheme) context in the render phase.
      // NOTE: CONTENT_BIT here does NOT call layoutNode.markDirty() — that is
      // only done when contentChanged === "text" (not for theme-only changes).
      if (
        (oldProps as Record<string, unknown>).theme !== (newProps as Record<string, unknown>).theme
      ) {
        bits |= BG_BIT | CONTENT_BIT
      }
      instance.dirtyBits = instance.dirtyEpoch !== epoch ? bits : instance.dirtyBits | bits
      instance.dirtyEpoch = epoch
    }

    // Track dirty node in module-level set for O(1) pipeline phase checks
    if (contentChanged) {
      trackContentDirty(instance)
    }

    // Track style-only dirty nodes for the fast path.
    // A node is style-only when: contentChanged is "style" (not "text"),
    // layoutChanged is false, bgDirty is false, AND the node doesn't already
    // have contentDirty or childrenDirty (which may have been set by
    // commitTextUpdate on a child BEFORE this commitUpdate runs — React
    // processes children before parents in the commit phase).
    if (
      contentChanged === "style" &&
      !layoutChanged &&
      !isDirty(instance.dirtyBits, instance.dirtyEpoch, BG_BIT) &&
      !isDirty(instance.dirtyBits, instance.dirtyEpoch, CONTENT_BIT) &&
      !isDirty(instance.dirtyBits, instance.dirtyEpoch, CHILDREN_BIT)
    ) {
      trackStyleOnlyDirty(instance)
    }

    instance.props = newProps

    // Only mark subtree/ancestor dirty when visual changes were detected.
    // Data attributes (data-*), event handlers, and other non-visual props
    // don't affect rendering, so propagating dirty flags wastes render phase
    // time traversing unchanged subtrees.
    //
    // scrollTo/scrollOffset changes affect rendering via scroll phase (children
    // shift position), so they must propagate subtreeDirty for render phase
    // traversal. Without this, the render phase fast-path skips ancestors of
    // the scroll container, never reaching the container to re-render at the
    // new scroll position.
    const scrollToChanged =
      (oldProps as Record<string, unknown>).scrollTo !==
      (newProps as Record<string, unknown>).scrollTo
    const scrollOffsetChanged =
      (oldProps as Record<string, unknown>).scrollOffset !==
      (newProps as Record<string, unknown>).scrollOffset
    if (scrollToChanged || scrollOffsetChanged) {
      trackScrollDirty(instance)
    }
    if (layoutChanged || contentChanged || scrollToChanged || scrollOffsetChanged) {
      markLayoutAncestorDirty(instance)
      markSubtreeDirty(instance)
    }
  },

  commitTextUpdate(textInstance: AgNode, _oldText: string, newText: string) {
    textInstance.textContent = newText
    syncTextContentSignal(textInstance)
    textInstance.props = { children: newText } as TextProps
    const epoch = getRenderEpoch()
    const bits = CONTENT_BIT | STYLE_PROPS_BIT
    textInstance.dirtyBits =
      textInstance.dirtyEpoch !== epoch ? bits : textInstance.dirtyBits | bits
    textInstance.dirtyEpoch = epoch
    trackContentDirty(textInstance)
    // Text content change affects layout (measure function will return different size)
    // Walk up to the nearest layout ancestor so its measure cache is invalidated
    markLayoutAncestorDirty(textInstance)
    markSubtreeDirty(textInstance)
  },

  // Finalization
  finalizeInitialChildren() {
    return false
  },

  prepareForCommit() {
    return null
  },

  resetAfterCommit(container: Container) {
    // Trigger render after React finishes committing
    container.onRender()
  },

  // Misc
  getPublicInstance(instance: AgNode) {
    return instance
  },

  shouldSetTextContent() {
    return false
  },

  clearContainer(container: Container) {
    // Notify focus manager before clearing — any child subtree may contain focus
    for (const child of container.root.children) {
      onNodeRemovedCallback?.(child)
    }
    // Dispose any fiber-local scopes in the cleared subtrees, plus any
    // attached to the root itself (withScope-style root scopes attach
    // here). The root's slot is detached first; descendants follow.
    disposeSubtreeScopes(container.root)
    for (const child of container.root.children) {
      if (container.root.layoutNode && child.layoutNode) {
        container.root.layoutNode.removeChild(child.layoutNode)
        child.layoutNode.free()
      }
    }
    container.root.children = []
    // Must invalidate dirty flags — same as removeChildFromContainer.
    // Without this, the pipeline can skip re-rendering after a root clear,
    // leaving stale buffer content (tree/buffer mismatch).
    {
      const epoch = getRenderEpoch()
      const bits = CHILDREN_BIT | CONTENT_BIT
      container.root.dirtyBits =
        container.root.dirtyEpoch !== epoch ? bits : container.root.dirtyBits | bits
      container.root.dirtyEpoch = epoch
    }
    container.root.layoutNode?.markDirty()
    trackContentDirty(container.root)
    markSubtreeDirty(container.root)
  },

  preparePortalMount() {
    // No-op for terminal
  },

  getCurrentEventPriority() {
    if (currentUpdatePriority !== NoEventPriority) {
      return currentUpdatePriority
    }
    return DefaultEventPriority
  },

  getInstanceFromNode() {
    return null
  },

  beforeActiveInstanceBlur() {
    // No-op
  },

  afterActiveInstanceBlur() {
    // No-op
  },

  prepareScopeUpdate() {
    // No-op
  },

  getInstanceFromScope() {
    return null
  },

  detachDeletedInstance(node: AgNode) {
    // Final-cleanup hook fired after React commits a deletion. The
    // per-subtree disposal already happened in removeChild /
    // removeChildFromContainer / clearContainer (those run during commit
    // with the parent chain intact). This catches any fiber-local scope
    // still attached at this point — a re-entrant attach during dispose,
    // or a fiber path that bypassed the structural removeChild flow.
    // Idempotent: disposeSubtreeScopes detaches before disposing, so a
    // node that's already been processed becomes a no-op.
    disposeSubtreeScopes(node)
  },

  // React 19 / react-reconciler 0.33+ required methods
  setCurrentUpdatePriority(newPriority: number) {
    currentUpdatePriority = newPriority
  },

  getCurrentUpdatePriority() {
    return currentUpdatePriority
  },

  resolveUpdatePriority() {
    if (currentUpdatePriority !== NoEventPriority) {
      return currentUpdatePriority
    }
    return DefaultEventPriority
  },

  maySuspendCommit() {
    return false
  },

  NotPendingTransition: null,
  HostTransitionContext: createContext(null),

  resetFormInstance() {
    // No-op
  },

  requestPostPaintCallback() {
    // No-op
  },

  shouldAttemptEagerTransition() {
    return false
  },

  trackSchedulerEvent() {
    // No-op
  },

  resolveEventType() {
    return null
  },

  resolveEventTimeStamp() {
    return -1.1
  },

  preloadInstance() {
    return true
  },

  startSuspendingCommit() {
    // No-op
  },

  suspendInstance() {
    // No-op
  },

  waitForCommitToBeReady() {
    return null
  },

  // ========================================================================
  // Suspense Support (hide/unhide)
  // ========================================================================

  /**
   * Hide an instance during Suspense.
   * Called when React needs to hide content while showing a fallback.
   *
   * Must set stylePropsDirty (render phase fast-path skip includes stylePropsDirty check),
   * layoutNode.markDirty() (hiding changes measured content — the layout engine
   * must recalculate dimensions), and markLayoutAncestorDirty (virtual text nodes
   * without layoutNode need the nearest layout ancestor dirty).
   */
  hideInstance(instance: AgNode) {
    instance.hidden = true
    const epoch = getRenderEpoch()
    const bits = CONTENT_BIT | STYLE_PROPS_BIT
    instance.dirtyBits = instance.dirtyEpoch !== epoch ? bits : instance.dirtyBits | bits
    instance.dirtyEpoch = epoch
    if (instance.layoutNode) {
      instance.layoutNode.markDirty()
    }
    trackContentDirty(instance)
    // Mark parent dirty to trigger re-render
    if (instance.parent) {
      if (instance.parent.dirtyEpoch !== epoch) {
        instance.parent.dirtyBits = CONTENT_BIT
        instance.parent.dirtyEpoch = epoch
      } else {
        instance.parent.dirtyBits |= CONTENT_BIT
      }
      trackContentDirty(instance.parent)
    }
    markLayoutAncestorDirty(instance)
    markSubtreeDirty(instance)
  },

  /**
   * Unhide an instance after Suspense resolves.
   * Called when the suspended content is ready to show.
   *
   * Same invalidation as hideInstance — the node's visibility change affects
   * layout (measured content changes) and paint (content must be re-rendered).
   */
  unhideInstance(instance: AgNode, _props: BoxProps | TextProps) {
    instance.hidden = false
    const epoch = getRenderEpoch()
    const bits = CONTENT_BIT | STYLE_PROPS_BIT
    instance.dirtyBits = instance.dirtyEpoch !== epoch ? bits : instance.dirtyBits | bits
    instance.dirtyEpoch = epoch
    if (instance.layoutNode) {
      instance.layoutNode.markDirty()
    }
    trackContentDirty(instance)
    // Mark parent dirty to trigger re-render
    if (instance.parent) {
      if (instance.parent.dirtyEpoch !== epoch) {
        instance.parent.dirtyBits = CONTENT_BIT
        instance.parent.dirtyEpoch = epoch
      } else {
        instance.parent.dirtyBits |= CONTENT_BIT
      }
      trackContentDirty(instance.parent)
    }
    markLayoutAncestorDirty(instance)
    markSubtreeDirty(instance)
  },

  /**
   * Hide a text instance during Suspense.
   *
   * Text instances don't have layout nodes. markLayoutAncestorDirty walks up
   * to the nearest layout ancestor and marks it dirty so the measure function
   * re-collects descendant text (collectNodeTextContent skips hidden children).
   */
  hideTextInstance(textInstance: AgNode) {
    textInstance.hidden = true
    const epoch = getRenderEpoch()
    const bits = CONTENT_BIT | STYLE_PROPS_BIT
    textInstance.dirtyBits =
      textInstance.dirtyEpoch !== epoch ? bits : textInstance.dirtyBits | bits
    textInstance.dirtyEpoch = epoch
    trackContentDirty(textInstance)
    if (textInstance.parent) {
      if (textInstance.parent.dirtyEpoch !== epoch) {
        textInstance.parent.dirtyBits = CONTENT_BIT
        textInstance.parent.dirtyEpoch = epoch
      } else {
        textInstance.parent.dirtyBits |= CONTENT_BIT
      }
      trackContentDirty(textInstance.parent)
    }
    markLayoutAncestorDirty(textInstance)
    markSubtreeDirty(textInstance)
  },

  /**
   * Unhide a text instance after Suspense resolves.
   *
   * Same invalidation as hideTextInstance — the text content changes when
   * hidden children become visible again.
   */
  unhideTextInstance(textInstance: AgNode, _text: string) {
    textInstance.hidden = false
    const epoch = getRenderEpoch()
    const bits = CONTENT_BIT | STYLE_PROPS_BIT
    textInstance.dirtyBits =
      textInstance.dirtyEpoch !== epoch ? bits : textInstance.dirtyBits | bits
    textInstance.dirtyEpoch = epoch
    trackContentDirty(textInstance)
    if (textInstance.parent) {
      if (textInstance.parent.dirtyEpoch !== epoch) {
        textInstance.parent.dirtyBits = CONTENT_BIT
        textInstance.parent.dirtyEpoch = epoch
      } else {
        textInstance.parent.dirtyBits |= CONTENT_BIT
      }
      trackContentDirty(textInstance.parent)
    }
    markLayoutAncestorDirty(textInstance)
    markSubtreeDirty(textInstance)
  },
}
