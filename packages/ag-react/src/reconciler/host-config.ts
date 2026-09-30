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
  trackNotifyDirty,
} from "@silvery/ag/dirty-tracking"
import { syncTextContentSignal } from "@silvery/ag/layout-signals"
import {
  markDirty,
  setDirty,
  INITIAL_EPOCH,
  isDirty,
  CONTENT_BIT,
  STYLE_PROPS_BIT,
  BG_BIT,
  CHILDREN_BIT,
  SUBTREE_BIT,
  ALL_RECONCILER_BITS,
} from "@silvery/ag/epoch"
import type { ViewportProps } from "@silvery/ag/viewport-types"
import { shallow } from "../hooks/useTerm"
import { classifyPropChanges } from "./helpers"
import {
  applyBoxProps,
  applyIslandProps,
  applyTextFlexItemProps,
  applyViewportProps,
  createNode,
  createVirtualTextNode,
  type IslandLayoutProps,
} from "./nodes"
import { createLogger } from "loggily"
import { warnOnce } from "@silvery/ansi"

const log = createLogger("silvery:reconciler")
const mountLog = createLogger("silvery:mount")

const DEBUG_PROP_NAMES = [
  "id",
  "testID",
  "data-component",
  "display",
  "position",
  "flexDirection",
  "width",
  "height",
  "minWidth",
  "minHeight",
  "flexGrow",
  "flexShrink",
  "overflow",
  "overflowX",
  "overflowY",
  "overflowIndicator",
  "scrollTo",
  "scrollOffset",
  "scrollbar",
  "scrollbarVisibility",
  "follow",
  "onWheel",
  "onClick",
  "onMouseDown",
  "onMouseUp",
  "onMouseMove",
] as const

function hostTypeLabel(type: AgNodeType): string {
  if (type === "silvery-box") return "Box"
  if (type === "silvery-text") return "Text"
  if (type === "silvery-viewport") return "Viewport"
  if (type === "silvery-island") return "Island"
  return type
}

function getDebugComponentName(node: AgNode): string {
  const props = node.props as Record<string, unknown>
  const explicitName = props["data-component"]
  if (typeof explicitName === "string" && explicitName.length > 0) return explicitName

  const base = hostTypeLabel(node.type)
  const testID = props.testID
  if (typeof testID === "string" && testID.length > 0) return `${base}#${testID}`

  const id = props.id
  if (typeof id === "string" && id.length > 0) return `${base}#${id}`

  return base
}

function summarizeDebugProp(value: unknown): unknown {
  if (typeof value === "function") return true
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }
  return undefined
}

function summarizeDebugProps(props: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {}
  for (const key of DEBUG_PROP_NAMES) {
    const value = summarizeDebugProp(props[key])
    if (value !== undefined) summary[key] = value
  }
  for (const key of Object.keys(props)) {
    if (!key.startsWith("data-") || key === "data-component") continue
    const value = summarizeDebugProp(props[key])
    if (value !== undefined) summary[key] = value
  }
  return summary
}

function logNodeLifecycle(event: "mount" | "update" | "unmount", node: AgNode): void {
  const props = node.props as Record<string, unknown>
  const component = getDebugComponentName(node)
  const text = node.textContent
  mountLog.debug?.(`${event} ${component}`, {
    event,
    component,
    type: node.type,
    props: summarizeDebugProps(props),
    propKeys: Object.keys(props)
      .filter((key) => key !== "children")
      .sort(),
    ...(text ? { text: text.length > 80 ? `${text.slice(0, 77)}...` : text } : {}),
  })
}

function logUnmountSubtree(node: AgNode): void {
  logNodeLifecycle("unmount", node)
  for (const child of node.children) {
    logUnmountSubtree(child)
  }
}

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
// Node Lifecycle Hooks
// ============================================================================

/**
 * Per-container observer for node lifecycle changes. Render roots own their
 * focus manager independently; lifecycle notifications must route to the
 * container that owns the updated/removed node, not to a process-wide callback.
 */
export interface NodeLifecycleObserver {
  onNodeRemoved?: (removedNode: AgNode) => void
  onNodeUpdated?: (updatedNode: AgNode) => void
  /**
   * A subtree was attached during the commit phase (fresh mount or keyed
   * move). React attaches a mounted subtree via ONE parent-level operation —
   * descendants never pass through the attach hooks individually — so
   * observers that react to node arrival (e.g. virtual-focus promotion,
   * 20992 f2) receive the subtree ROOT and search within it.
   */
  onSubtreeAttached?: (attachedRoot: AgNode) => void
}

// Module-instance-shared via globalThis for the same reason as nodeScopes
// below: tests and renderers may import this file through different module
// specifiers, but AgNode ownership must be shared across those copies.
const NODE_CONTAINERS_KEY = Symbol.for("@silvery/ag-react/reconciler/nodeContainers")
type NodeContainersRegistry = WeakMap<AgNode, Container>
const nodeContainers: NodeContainersRegistry =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- globalThis registry
  (globalThis as any)[NODE_CONTAINERS_KEY] ??
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((globalThis as any)[NODE_CONTAINERS_KEY] = new WeakMap<AgNode, Container>())

function bindSubtreeToContainer(node: AgNode, container: Container): void {
  nodeContainers.set(node, container)
  for (const child of node.children) {
    bindSubtreeToContainer(child, container)
  }
}

function unbindSubtreeFromContainer(node: AgNode): void {
  nodeContainers.delete(node)
  for (const child of node.children) {
    unbindSubtreeFromContainer(child)
  }
}

function getOwningContainer(node: AgNode): Container | undefined {
  let current: AgNode | null = node
  while (current) {
    const container = nodeContainers.get(current)
    if (container) return container
    current = current.parent
  }
  return undefined
}

export function registerContainer(container: Container): void {
  bindSubtreeToContainer(container.root, container)
}

export function releaseContainerLifecycle(container: Container): void {
  container.nodeLifecycle = null
  unbindSubtreeFromContainer(container.root)
}

export function setContainerNodeLifecycle(
  container: Container,
  observer: NodeLifecycleObserver | null,
): void {
  container.nodeLifecycle = observer
}

function notifyNodeRemoved(container: Container | undefined, removedNode: AgNode): void {
  container?.nodeLifecycle?.onNodeRemoved?.(removedNode)
}

function notifyNodeUpdated(updatedNode: AgNode): void {
  getOwningContainer(updatedNode)?.nodeLifecycle?.onNodeUpdated?.(updatedNode)
}

function notifySubtreeAttached(container: Container | undefined, attachedRoot: AgNode): void {
  container?.nodeLifecycle?.onSubtreeAttached?.(attachedRoot)
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
 * Box props that the layout phase's notify step reads straight from props to
 * write a node's layout signals (cursorRect, focusedNodeId, selectionFragments,
 * anchorRect, parkRect, decorationRects). A change to one is tracked with
 * `trackNotifyDirty` so the layout-on-demand gate runs that step.
 */
const NOTIFY_SYNCED_PROPS = [
  "decorations",
  "cursorOffset",
  "focused",
  "selectionIntent",
  "anchorRef",
  "parkOffset",
] as const

/**
 * Compared shallowly, not by identity: TextInput, TextArea and Terminal build
 * `cursorOffset` on every render, so an identity check would run the notify
 * step on each of their re-renders even when the caret has not moved. The
 * notify step reads only the top-level fields of these props, so a shallow
 * match means every signal it writes would come out the same.
 */
function notifySyncedPropChanged(
  oldProps: Record<string, unknown>,
  newProps: Record<string, unknown>,
): boolean {
  for (const key of NOTIFY_SYNCED_PROPS) {
    if (!shallow(oldProps[key], newProps[key])) return true
  }
  return false
}

/**
 * Mark this node and all ancestors as having dirty content/layout.
 * Used to enable fast-path subtree skipping in renderPhase.
 */
function markSubtreeDirty(node: AgNode | null): void {
  while (node && !isDirty(node, SUBTREE_BIT)) {
    markDirty(node, SUBTREE_BIT)
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
    markDirty(ancestor, CONTENT_BIT | STYLE_PROPS_BIT)
    ancestor.layoutNode.markDirty()
    trackContentDirty(ancestor)
  }
}

// ============================================================================
// Dev Warnings
// ============================================================================
//
// Box-inside-Text warning uses the shared `warnOnce` latch from @silvery/ansi
// (see km-silvery.latch-consolidation). Tests take fresh modules to see it fire again.

const BOX_INSIDE_TEXT_WARNING_ID = "silvery/ag-react:box-in-text"

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
  // Optional: createContainer() always sets this (to null until registerContainer
  // attaches an observer), but bare test fixtures construct a minimal Container
  // without it, and every read site is optional-chained (`?.nodeLifecycle?.`).
  nodeLifecycle?: NodeLifecycleObserver | null
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
    rootContainer: Container,
    hostContext: HostContext,
  ): AgNode {
    // Every node is born into the tree that will render it, so it shares that
    // tree's epoch state from the start — no adoption pass, and no window in
    // which a node's dirty bits answer to the wrong renderer.
    const epochOwner = rootContainer.root.epochOwner
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
      const node = createVirtualTextNode(props as TextProps, epochOwner)
      logNodeLifecycle("mount", node)
      return node
    }
    const node = createNode(type, props, epochOwner)
    logNodeLifecycle("mount", node)
    return node
  },

  createTextInstance(text: string, rootContainer: Container, hostContext: HostContext): AgNode {
    // Ink-compat: throw when text appears directly in a Box (outside Text)
    if (inkStrictValidation && !hostContext.isInsideText && text.trim().length > 0) {
      throw new Error(`Text string "${text}" must be rendered inside <Text> component`)
    }
    // Raw text nodes don't have layout nodes - they're just data nodes
    // Their content is rendered by their parent silvery-text element
    const epochOwner = rootContainer.root.epochOwner
    const epoch = epochOwner.epoch
    const node: AgNode = {
      type: "silvery-text",
      props: { children: text } as TextProps,
      children: [],
      parent: null,
      epochOwner,
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
    logNodeLifecycle("mount", node)
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
    const container = getOwningContainer(parentInstance)
    if (container) bindSubtreeToContainer(child, container)
    // Only add to layout tree if both nodes have layout nodes
    if (parentInstance.layoutNode && child.layoutNode) {
      // Count non-raw-text children for proper layout index
      const layoutIndex = parentInstance.children.filter((c) => c.layoutNode !== null).length - 1
      parentInstance.layoutNode.insertChild(child.layoutNode, layoutIndex)
    }
    {
      markDirty(parentInstance, CHILDREN_BIT | CONTENT_BIT)
    }
    parentInstance.layoutNode?.markDirty()
    trackContentDirty(parentInstance)
    markLayoutAncestorDirty(parentInstance)
    markSubtreeDirty(parentInstance)
    notifySubtreeAttached(container, child)
  },

  appendInitialChild(parentInstance: AgNode, child: AgNode) {
    child.parent = parentInstance
    parentInstance.children.push(child)
    const container = getOwningContainer(parentInstance)
    if (container) bindSubtreeToContainer(child, container)
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
    bindSubtreeToContainer(child, container)
    if (container.root.layoutNode && child.layoutNode) {
      const layoutIndex = container.root.children.filter((c) => c.layoutNode !== null).length - 1
      container.root.layoutNode.insertChild(child.layoutNode, layoutIndex)
    }
    {
      markDirty(container.root, CHILDREN_BIT | CONTENT_BIT)
    }
    container.root.layoutNode?.markDirty()
    trackContentDirty(container.root)
    markSubtreeDirty(container.root)
    notifySubtreeAttached(container, child)
  },

  removeChild(parentInstance: AgNode, child: AgNode) {
    const index = parentInstance.children.indexOf(child)
    if (index !== -1) {
      // Notify focus manager before detaching (needs parent chain intact for subtree check)
      const container = getOwningContainer(parentInstance) ?? getOwningContainer(child)
      notifyNodeRemoved(container, child)
      logUnmountSubtree(child)
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
      unbindSubtreeFromContainer(child)
      child.parent = null
      {
        markDirty(parentInstance, CHILDREN_BIT | CONTENT_BIT)
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
      notifyNodeRemoved(container, child)
      logUnmountSubtree(child)
      disposeSubtreeScopes(child)
      container.root.children.splice(index, 1)
      if (container.root.layoutNode && child.layoutNode) {
        container.root.layoutNode.removeChild(child.layoutNode)
        child.layoutNode.free()
      }
      unbindSubtreeFromContainer(child)
      child.parent = null
      {
        markDirty(container.root, CHILDREN_BIT | CONTENT_BIT)
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
      const container = getOwningContainer(parentInstance)
      if (container) bindSubtreeToContainer(child, container)
      if (parentInstance.layoutNode && child.layoutNode) {
        // Count non-raw-text children before this position for proper layout index
        const layoutIndex = parentInstance.children
          .slice(0, beforeIndex)
          .filter((c) => c.layoutNode !== null).length
        parentInstance.layoutNode.insertChild(child.layoutNode, layoutIndex)
      }
      {
        markDirty(parentInstance, CHILDREN_BIT | CONTENT_BIT)
      }
      parentInstance.layoutNode?.markDirty()
      trackContentDirty(parentInstance)
      markLayoutAncestorDirty(parentInstance)
      markSubtreeDirty(parentInstance)
      notifySubtreeAttached(container, child)
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
      bindSubtreeToContainer(child, container)
      if (container.root.layoutNode && child.layoutNode) {
        const layoutIndex = container.root.children
          .slice(0, beforeIndex)
          .filter((c) => c.layoutNode !== null).length
        container.root.layoutNode.insertChild(child.layoutNode, layoutIndex)
      }
      {
        markDirty(container.root, CHILDREN_BIT | CONTENT_BIT)
      }
      container.root.layoutNode?.markDirty()
      trackContentDirty(container.root)
      markSubtreeDirty(container.root)
      notifySubtreeAttached(container, child)
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
        } else if (instance.type === "silvery-viewport") {
          applyViewportProps(
            instance.layoutNode,
            newProps as unknown as ViewportProps,
            oldProps as unknown as ViewportProps,
          )
        } else if (instance.type === "silvery-island") {
          applyIslandProps(
            instance.layoutNode,
            newProps as unknown as IslandLayoutProps,
            oldProps as unknown as IslandLayoutProps,
          )
        } else {
          applyBoxProps(instance.layoutNode, newProps as BoxProps, oldProps as BoxProps)
        }
        instance.layoutNode.markDirty()
      }
    }
    if (contentChanged) {
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
      markDirty(instance, bits)
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
      !isDirty(instance, BG_BIT) &&
      !isDirty(instance, CONTENT_BIT) &&
      !isDirty(instance, CHILDREN_BIT)
    ) {
      trackStyleOnlyDirty(instance)
    }

    instance.props = newProps
    logNodeLifecycle("update", instance)
    notifyNodeUpdated(instance)

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
    // The notify step writes layout signals from six props it reads directly
    // (layout-signals.ts syncRectSignals / syncDecorationRects). They change no
    // dimension, so Flexily stays clean: the notify set keeps the ag.ts
    // layout-on-demand gate from skipping that step, and the subtree mark lets
    // the frame past the pre-pipeline dirty check. No relayout is requested.
    const notifyPropChanged = notifySyncedPropChanged(
      oldProps as Record<string, unknown>,
      newProps as Record<string, unknown>,
    )
    if (notifyPropChanged) {
      trackNotifyDirty(instance)
    }
    if (layoutChanged || contentChanged || scrollToChanged || scrollOffsetChanged) {
      markLayoutAncestorDirty(instance)
      markSubtreeDirty(instance)
    } else if (notifyPropChanged) {
      markSubtreeDirty(instance)
    }
  },

  commitTextUpdate(textInstance: AgNode, _oldText: string, newText: string) {
    textInstance.textContent = newText
    syncTextContentSignal(textInstance)
    textInstance.props = { children: newText } as TextProps
    markDirty(textInstance, CONTENT_BIT | STYLE_PROPS_BIT)
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
    // React's development reconciler writes User Timing entries per component,
    // and Bun retains that native timeline until its owner clears it. Silvery
    // owns the commit timeline, so bound it before invoking user render work.
    // This is deliberately process-wide: app marks do not survive a dev commit.
    if (process.env.NODE_ENV !== "production") {
      performance.clearMeasures()
      performance.clearMarks()
    }
    return null
  },

  resetAfterCommit(container: Container) {
    // Trigger render after React finishes committing.
    //
    // Render-budget watchdog (zero-overhead when disabled): if the commit
    // exceeds `SILVERY_RENDER_BUDGET_MS` (default 500ms), emit a console
    // warning with the duration. Helps catch cascading-render regressions
    // before they manifest as user-visible freezes (the symptom that
    // motivated @km/board/projection-stability-improvements).
    //
    // Disabled by default in production by setting the env var to 0 or
    // unsetting it; budget is opt-in. Set `SILVERY_RENDER_BUDGET_MS=500`
    // (or any positive number) during dev to enable.
    const budgetEnv =
      typeof process !== "undefined" ? process.env.SILVERY_RENDER_BUDGET_MS : undefined
    const budget = budgetEnv !== undefined ? Number(budgetEnv) : 0
    if (budget > 0 && Number.isFinite(budget)) {
      const start = performance.now()
      container.onRender()
      const elapsed = performance.now() - start
      if (elapsed > budget) {
        // Use console.warn here (not loggily) so the warning surfaces in
        // the dev console even when no DEBUG namespace is set. Stays out
        // of the rendered TUI surface — this fires after React's commit
        // boundary and writes via the console-sink the host installs.
        // eslint-disable-next-line no-console
        console.warn(
          `[silvery] render commit exceeded budget: ${elapsed.toFixed(0)}ms > ${budget}ms — see @km/board/projection-stability-improvements for cascade-prevention guidance`,
        )
      }
    } else {
      container.onRender()
    }
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
      notifyNodeRemoved(container, child)
      logUnmountSubtree(child)
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
      unbindSubtreeFromContainer(child)
    }
    container.root.children = []
    // Must invalidate dirty flags — same as removeChildFromContainer.
    // Without this, the pipeline can skip re-rendering after a root clear,
    // leaving stale buffer content (tree/buffer mismatch).
    {
      markDirty(container.root, CHILDREN_BIT | CONTENT_BIT)
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
    unbindSubtreeFromContainer(node)
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
    markDirty(instance, CONTENT_BIT | STYLE_PROPS_BIT)
    if (instance.layoutNode) {
      instance.layoutNode.markDirty()
    }
    trackContentDirty(instance)
    // Mark parent dirty to trigger re-render
    if (instance.parent) {
      markDirty(instance.parent, CONTENT_BIT)
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
    markDirty(instance, CONTENT_BIT | STYLE_PROPS_BIT)
    if (instance.layoutNode) {
      instance.layoutNode.markDirty()
    }
    trackContentDirty(instance)
    // Mark parent dirty to trigger re-render
    if (instance.parent) {
      markDirty(instance.parent, CONTENT_BIT)
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
    markDirty(textInstance, CONTENT_BIT | STYLE_PROPS_BIT)
    trackContentDirty(textInstance)
    if (textInstance.parent) {
      markDirty(textInstance.parent, CONTENT_BIT)
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
    markDirty(textInstance, CONTENT_BIT | STYLE_PROPS_BIT)
    trackContentDirty(textInstance)
    if (textInstance.parent) {
      markDirty(textInstance.parent, CONTENT_BIT)
      trackContentDirty(textInstance.parent)
    }
    markLayoutAncestorDirty(textInstance)
    markSubtreeDirty(textInstance)
  },
}
