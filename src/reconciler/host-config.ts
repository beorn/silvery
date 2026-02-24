/**
 * React Reconciler Host Config
 *
 * Defines how React creates, updates, and manages InkxNodes.
 * This is the bridge between React's reconciliation algorithm
 * and our custom terminal node tree.
 */

import { createContext } from "react"
import { DefaultEventPriority, DiscreteEventPriority, NoEventPriority } from "react-reconciler/constants.js"
import type { BoxProps, InkxNode, InkxNodeType, TextProps } from "../types.js"
import { contentPropsChanged, layoutPropsChanged, propsEqual } from "./helpers.js"
import { applyBoxProps, createNode, createVirtualTextNode } from "./nodes.js"

// ============================================================================
// Subtree Dirty Propagation
// ============================================================================

/**
 * Mark this node and all ancestors as having dirty content/layout.
 * Used to enable fast-path subtree skipping in contentPhase.
 */
function markSubtreeDirty(node: InkxNode | null): void {
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
function markLayoutAncestorDirty(node: InkxNode): void {
  if (node.layoutNode) return
  let ancestor: InkxNode | null = node.parent
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
// Types
// ============================================================================

/**
 * Container type - the root of our Inkx tree
 */
export interface Container {
  root: InkxNode
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
 * This defines how React creates, updates, and manages our custom InkxNodes.
 */
export const hostConfig = {
  // Renderer identity (used by React DevTools to identify this renderer)
  rendererPackageName: "inkx",
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

  getChildHostContext(parentHostContext: HostContext, type: InkxNodeType): HostContext {
    // Once inside a text node, stay inside
    const isInsideText = parentHostContext.isInsideText || type === "inkx-text"
    if (isInsideText === parentHostContext.isInsideText) {
      return parentHostContext
    }
    return { isInsideText }
  },

  // Instance creation
  createInstance(
    type: InkxNodeType,
    props: BoxProps | TextProps,
    _rootContainer: unknown,
    hostContext: HostContext,
  ): InkxNode {
    // Nested text nodes become "virtual" - no layout node
    if (type === "inkx-text" && hostContext.isInsideText) {
      return createVirtualTextNode(props as TextProps)
    }
    return createNode(type, props)
  },

  createTextInstance(text: string): InkxNode {
    // Raw text nodes don't have layout nodes - they're just data nodes
    // Their content is rendered by their parent inkx-text element
    const node: InkxNode = {
      type: "inkx-text",
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
  appendChild(parentInstance: InkxNode, child: InkxNode) {
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

  appendInitialChild(parentInstance: InkxNode, child: InkxNode) {
    child.parent = parentInstance
    parentInstance.children.push(child)
    // Only add to layout tree if both nodes have layout nodes
    if (parentInstance.layoutNode && child.layoutNode) {
      const layoutIndex = parentInstance.children.filter((c) => c.layoutNode !== null).length - 1
      parentInstance.layoutNode.insertChild(child.layoutNode, layoutIndex)
    }
  },

  appendChildToContainer(container: Container, child: InkxNode) {
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

  removeChild(parentInstance: InkxNode, child: InkxNode) {
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

  removeChildFromContainer(container: Container, child: InkxNode) {
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

  insertBefore(parentInstance: InkxNode, child: InkxNode, beforeChild: InkxNode) {
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
        const layoutIndex = parentInstance.children.slice(0, beforeIndex).filter((c) => c.layoutNode !== null).length
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

  insertInContainerBefore(container: Container, child: InkxNode, beforeChild: InkxNode) {
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
        const layoutIndex = container.root.children.slice(0, beforeIndex).filter((c) => c.layoutNode !== null).length
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
    _instance: InkxNode,
    _type: InkxNodeType,
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
    instance: InkxNode,
    _type: InkxNodeType,
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
    if (layoutPropsChanged(oldProps as Record<string, unknown>, newProps as Record<string, unknown>)) {
      if (instance.layoutNode) {
        applyBoxProps(instance.layoutNode, newProps as BoxProps)
        instance.layoutNode.markDirty()
      }
      instance.layoutDirty = true
    }

    // Check if content changed (text children, style props like backgroundColor)
    // Returns "text" for text content changes (affect layout) or "style" for
    // style-only changes (borderColor, color, etc. — don't affect layout).
    const contentChanged = contentPropsChanged(oldProps as Record<string, unknown>, newProps as Record<string, unknown>)
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
        (oldProps as Record<string, unknown>).backgroundColor !== (newProps as Record<string, unknown>).backgroundColor
      ) {
        instance.bgDirty = true
      }
      // Border removal: when borderStyle goes from truthy to falsy, stale border
      // characters (╭╮╰╯│─) persist in the cloned buffer because renderBox doesn't
      // draw anything at those positions. Setting bgDirty makes contentAreaAffected
      // true, triggering clearNodeRegion to fill the area with inherited bg.
      // Border *addition* doesn't need this — renderBorder overwrites the old cells.
      if ((oldProps as Record<string, unknown>).borderStyle && !(newProps as Record<string, unknown>).borderStyle) {
        instance.bgDirty = true
      }
      // Outline removal: same issue — stale outline characters persist in the clone.
      if ((oldProps as Record<string, unknown>).outlineStyle && !(newProps as Record<string, unknown>).outlineStyle) {
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
      (oldProps as Record<string, unknown>).scrollTo !== (newProps as Record<string, unknown>).scrollTo
    const scrollOffsetChanged =
      (oldProps as Record<string, unknown>).scrollOffset !== (newProps as Record<string, unknown>).scrollOffset
    if (instance.layoutDirty || contentChanged || scrollToChanged || scrollOffsetChanged) {
      markLayoutAncestorDirty(instance)
      markSubtreeDirty(instance)
    }
  },

  commitTextUpdate(textInstance: InkxNode, _oldText: string, newText: string) {
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
  getPublicInstance(instance: InkxNode) {
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
  hideInstance(instance: InkxNode) {
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
  unhideInstance(instance: InkxNode, _props: BoxProps | TextProps) {
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
  hideTextInstance(textInstance: InkxNode) {
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
  unhideTextInstance(textInstance: InkxNode, _text: string) {
    textInstance.hidden = false
    textInstance.contentDirty = true
    if (textInstance.parent) {
      textInstance.parent.contentDirty = true
    }
    markSubtreeDirty(textInstance)
  },
}
