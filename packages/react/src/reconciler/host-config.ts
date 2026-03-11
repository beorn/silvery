/**
 * React Reconciler Host Config
 *
 * Defines how React creates, updates, and manages SilveryNodes.
 * This is the bridge between React's reconciliation algorithm
 * and our custom terminal node tree.
 */

import { createContext } from "react"
import {
  DefaultEventPriority,
  DiscreteEventPriority,
  NoEventPriority,
} from "react-reconciler/constants.js"
import type { BoxProps, TeaNode, TeaNodeType, TextProps } from "@silvery/tea/types"
import { contentPropsChanged, layoutPropsChanged, propsEqual } from "./helpers"
import { applyBoxProps, createNode, createVirtualTextNode } from "./nodes"

// ============================================================================
// Subtree Dirty Propagation
// ============================================================================

/**
 * Mark this node and all ancestors as having dirty content/layout.
 * Used to enable fast-path subtree skipping in contentPhase.
 */
function markSubtreeDirty(node: TeaNode | null): void {
  while (node && !node.subtreeDirty) {
    node.subtreeDirty = true
    node = node.parent
  }
}

/**
 * When a child change (append/remove/insert/text-update) occurs inside a
 * virtual text subtree (no layoutNode), the nearest layout ancestor must be
 * notified so its measure function re-collects descendant text and the layout
 * engine recalculates dimensions. Without this, the measure cache stays stale
 * and contentPhase renders at the wrong size / doesn't clear old content.
 *
 * No-op when the node already has a layoutNode (normal path handles it).
 */
function markLayoutAncestorDirty(node: TeaNode): void {
  if (node.layoutNode) return
  let ancestor: TeaNode | null = node.parent
  while (ancestor && !ancestor.layoutNode) {
    ancestor = ancestor.parent
  }
  if (ancestor?.layoutNode) {
    ancestor.contentDirty = true
    ancestor.paintDirty = true
    ancestor.layoutDirty = true
    ancestor.layoutNode.markDirty()
  }
}

// ============================================================================
// Dev Warnings
// ============================================================================

/**
 * Track whether we've already warned about Box-inside-Text
 * to avoid spamming the console on every re-render.
 */
let hasWarnedBoxInsideText = false

/** Reset the warning flag (for testing). */
export function _resetBoxInsideTextWarning(): void {
  hasWarnedBoxInsideText = false
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
  root: TeaNode
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
  rendererPackageName: "@silvery/react",
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

  getChildHostContext(parentHostContext: HostContext, type: TeaNodeType): HostContext {
    // Once inside a text node, stay inside
    const isInsideText = parentHostContext.isInsideText || type === "silvery-text"
    if (isInsideText === parentHostContext.isInsideText) {
      return parentHostContext
    }
    return { isInsideText }
  },

  // Instance creation
  createInstance(
    type: TeaNodeType,
    props: BoxProps | TextProps,
    _rootContainer: unknown,
    hostContext: HostContext,
  ): TeaNode {
    // Ink-compat: throw when a Box is nested inside a Text
    if (type === "silvery-box" && hostContext.isInsideText) {
      if (inkStrictValidation) {
        throw new Error("<Box> can\u2019t be nested inside <Text> component")
      }
      if (process.env.NODE_ENV !== "production" && !hasWarnedBoxInsideText) {
        hasWarnedBoxInsideText = true
        console.warn(
          "Warning: <Box> cannot be nested inside <Text>. This produces undefined layout behavior.",
        )
      }
    }

    // Nested text nodes become "virtual" - no layout node
    if (type === "silvery-text" && hostContext.isInsideText) {
      return createVirtualTextNode(props as TextProps)
    }
    return createNode(type, props)
  },

  createTextInstance(
    text: string,
    _rootContainer: unknown,
    hostContext: HostContext,
  ): TeaNode {
    // Ink-compat: throw when text appears directly in a Box (outside Text)
    if (inkStrictValidation && !hostContext.isInsideText && text.trim().length > 0) {
      throw new Error(
        `Text string "${text}" must be rendered inside <Text> component`,
      )
    }
    // Raw text nodes don't have layout nodes - they're just data nodes
    // Their content is rendered by their parent silvery-text element
    const node: TeaNode = {
      type: "silvery-text",
      props: { children: text } as TextProps,
      children: [],
      parent: null,
      layoutNode: null, // No layout node for raw text
      contentRect: null,
      screenRect: null,
      prevLayout: null,
      prevScreenRect: null,
      layoutChangedThisFrame: false,
      layoutDirty: false,
      contentDirty: true,
      paintDirty: true,
      bgDirty: true,
      subtreeDirty: true,
      childrenDirty: false,
      layoutSubscribers: new Set(),
      textContent: text,
      isRawText: true,
    }
    return node
  },

  // Tree operations
  appendChild(parentInstance: TeaNode, child: TeaNode) {
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
    parentInstance.childrenDirty = true
    parentInstance.contentDirty = true // Text measure cache must re-collect children
    parentInstance.layoutDirty = true
    parentInstance.layoutNode?.markDirty()
    markLayoutAncestorDirty(parentInstance)
    markSubtreeDirty(parentInstance)
  },

  appendInitialChild(parentInstance: TeaNode, child: TeaNode) {
    child.parent = parentInstance
    parentInstance.children.push(child)
    // Only add to layout tree if both nodes have layout nodes
    if (parentInstance.layoutNode && child.layoutNode) {
      const layoutIndex = parentInstance.children.filter((c) => c.layoutNode !== null).length - 1
      parentInstance.layoutNode.insertChild(child.layoutNode, layoutIndex)
    }
  },

  appendChildToContainer(container: Container, child: TeaNode) {
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
    container.root.childrenDirty = true
    container.root.contentDirty = true // Text measure cache must re-collect children
    container.root.layoutDirty = true
    container.root.layoutNode?.markDirty()
    markSubtreeDirty(container.root)
  },

  removeChild(parentInstance: TeaNode, child: TeaNode) {
    const index = parentInstance.children.indexOf(child)
    if (index !== -1) {
      parentInstance.children.splice(index, 1)
      if (parentInstance.layoutNode && child.layoutNode) {
        parentInstance.layoutNode.removeChild(child.layoutNode)
        child.layoutNode.free()
      }
      child.parent = null
      parentInstance.childrenDirty = true
      parentInstance.contentDirty = true // Text measure cache must re-collect children
      parentInstance.layoutDirty = true
      parentInstance.layoutNode?.markDirty()
      markLayoutAncestorDirty(parentInstance)
      markSubtreeDirty(parentInstance)
    }
  },

  removeChildFromContainer(container: Container, child: TeaNode) {
    const index = container.root.children.indexOf(child)
    if (index !== -1) {
      container.root.children.splice(index, 1)
      if (container.root.layoutNode && child.layoutNode) {
        container.root.layoutNode.removeChild(child.layoutNode)
        child.layoutNode.free()
      }
      child.parent = null
      container.root.childrenDirty = true
      container.root.contentDirty = true // Text measure cache must re-collect children
      container.root.layoutDirty = true
      container.root.layoutNode?.markDirty()
      markSubtreeDirty(container.root)
    }
  },

  insertBefore(parentInstance: TeaNode, child: TeaNode, beforeChild: TeaNode) {
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
      parentInstance.childrenDirty = true
      parentInstance.contentDirty = true // Text measure cache must re-collect children
      parentInstance.layoutDirty = true
      parentInstance.layoutNode?.markDirty()
      markLayoutAncestorDirty(parentInstance)
      markSubtreeDirty(parentInstance)
    }
  },

  insertInContainerBefore(container: Container, child: TeaNode, beforeChild: TeaNode) {
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
      container.root.childrenDirty = true
      container.root.contentDirty = true // Text measure cache must re-collect children
      container.root.layoutDirty = true
      container.root.layoutNode?.markDirty()
      markSubtreeDirty(container.root)
    }
  },

  // Updates
  prepareUpdate(
    _instance: TeaNode,
    _type: TeaNodeType,
    oldProps: BoxProps | TextProps,
    newProps: BoxProps | TextProps,
  ): boolean | null {
    // Return true if we need to update
    return !propsEqual(oldProps as Record<string, unknown>, newProps as Record<string, unknown>)
  },

  // Note: react-reconciler 0.33+ changed the signature from
  // commitUpdate(instance, updatePayload, type, oldProps, newProps) to
  // commitUpdate(instance, type, oldProps, newProps, finishedWork)
  commitUpdate(
    instance: TeaNode,
    _type: TeaNodeType,
    oldProps: BoxProps | TextProps,
    newProps: BoxProps | TextProps,
    _finishedWork: unknown,
  ) {
    // Early exit if props are equal (React may call commitUpdate even when nothing changed)
    if (propsEqual(oldProps as Record<string, unknown>, newProps as Record<string, unknown>)) {
      instance.props = newProps
      return
    }

    // Check if layout-affecting props changed
    if (
      layoutPropsChanged(oldProps as Record<string, unknown>, newProps as Record<string, unknown>)
    ) {
      if (instance.layoutNode) {
        applyBoxProps(instance.layoutNode, newProps as BoxProps, oldProps as BoxProps)
        instance.layoutNode.markDirty()
      }
      instance.layoutDirty = true
    }

    // Check if content changed (text children, style props like backgroundColor)
    // Returns "text" for text content changes (affect layout) or "style" for
    // style-only changes (borderColor, color, etc. — don't affect layout).
    const contentChanged = contentPropsChanged(
      oldProps as Record<string, unknown>,
      newProps as Record<string, unknown>,
    )
    if (contentChanged) {
      // paintDirty: always set for any visual change. Content phase uses this
      // to know the node needs re-rendering (border, text style, bg, etc.).
      instance.paintDirty = true
      // contentDirty: only for text content changes (not style-only changes).
      // Style-only changes (borderColor, color, bold) set paintDirty but NOT
      // contentDirty, so content phase won't cascade to children for border-only
      // changes where the content area is unchanged.
      if (contentChanged === "text") {
        instance.contentDirty = true
        if (instance.layoutNode) {
          instance.layoutNode.markDirty()
        }
      }
      // bgDirty: specifically track backgroundColor changes (added/changed/removed).
      // Content phase uses this to cascade re-renders only when the content area
      // was actually affected (not for border-only paint changes).
      if (
        (oldProps as Record<string, unknown>).backgroundColor !==
        (newProps as Record<string, unknown>).backgroundColor
      ) {
        instance.bgDirty = true
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
        instance.bgDirty = true
      }
      // Outline removal: same issue — stale outline characters persist in the clone.
      if (
        (oldProps as Record<string, unknown>).outlineStyle &&
        !(newProps as Record<string, unknown>).outlineStyle
      ) {
        instance.bgDirty = true
      }
      // Theme change: all descendants need re-rendering with new token values.
      // bgDirty makes contentAreaAffected=true, cascading parentRegionChanged
      // to force children to re-render with the new theme context.
      if (
        (oldProps as Record<string, unknown>).theme !== (newProps as Record<string, unknown>).theme
      ) {
        instance.bgDirty = true
      }
    }

    instance.props = newProps

    // Only mark subtree/ancestor dirty when visual changes were detected.
    // Data attributes (data-*), event handlers, and other non-visual props
    // don't affect rendering, so propagating dirty flags wastes content phase
    // time traversing unchanged subtrees.
    //
    // scrollTo/scrollOffset changes affect rendering via scroll phase (children
    // shift position), so they must propagate subtreeDirty for content phase
    // traversal. Without this, the content phase fast-path skips ancestors of
    // the scroll container, never reaching the container to re-render at the
    // new scroll position.
    const scrollToChanged =
      (oldProps as Record<string, unknown>).scrollTo !==
      (newProps as Record<string, unknown>).scrollTo
    const scrollOffsetChanged =
      (oldProps as Record<string, unknown>).scrollOffset !==
      (newProps as Record<string, unknown>).scrollOffset
    if (instance.layoutDirty || contentChanged || scrollToChanged || scrollOffsetChanged) {
      markLayoutAncestorDirty(instance)
      markSubtreeDirty(instance)
    }
  },

  commitTextUpdate(textInstance: TeaNode, _oldText: string, newText: string) {
    textInstance.textContent = newText
    textInstance.props = { children: newText } as TextProps
    textInstance.contentDirty = true
    textInstance.paintDirty = true
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
  getPublicInstance(instance: TeaNode) {
    return instance
  },

  shouldSetTextContent() {
    return false
  },

  clearContainer(container: Container) {
    for (const child of container.root.children) {
      if (container.root.layoutNode && child.layoutNode) {
        container.root.layoutNode.removeChild(child.layoutNode)
        child.layoutNode.free()
      }
    }
    container.root.children = []
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

  detachDeletedInstance() {
    // No-op
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
   */
  hideInstance(instance: TeaNode) {
    instance.hidden = true
    instance.contentDirty = true
    // Mark parent dirty to trigger re-render
    if (instance.parent) {
      instance.parent.contentDirty = true
    }
    markSubtreeDirty(instance)
  },

  /**
   * Unhide an instance after Suspense resolves.
   * Called when the suspended content is ready to show.
   */
  unhideInstance(instance: TeaNode, _props: BoxProps | TextProps) {
    instance.hidden = false
    instance.contentDirty = true
    // Mark parent dirty to trigger re-render
    if (instance.parent) {
      instance.parent.contentDirty = true
    }
    markSubtreeDirty(instance)
  },

  /**
   * Hide a text instance during Suspense.
   */
  hideTextInstance(textInstance: TeaNode) {
    textInstance.hidden = true
    textInstance.contentDirty = true
    if (textInstance.parent) {
      textInstance.parent.contentDirty = true
    }
    markSubtreeDirty(textInstance)
  },

  /**
   * Unhide a text instance after Suspense resolves.
   */
  unhideTextInstance(textInstance: TeaNode, _text: string) {
    textInstance.hidden = false
    textInstance.contentDirty = true
    if (textInstance.parent) {
      textInstance.parent.contentDirty = true
    }
    markSubtreeDirty(textInstance)
  },
}
