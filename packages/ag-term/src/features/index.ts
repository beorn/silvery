/**
 * Interaction features — high-level services that wire headless machines
 * to ag-term's buffer, clipboard, and render pipeline.
 *
 * Features are created by composition plugins (withDomEvents, withFocus)
 * and registered in the CapabilityRegistry for cross-feature discovery.
 *
 * @packageDocumentation
 */

// Selection
export { createSelectionFeature } from "./selection"
export type { SelectionFeature, SelectionFeatureOptions } from "./selection"

// Drag
export { createDragFeature } from "./drag"
export type { DragFeature, DragFeatureOptions } from "./drag"

// Clipboard
export { createOSC52Clipboard, wrapClipboardBackend } from "./clipboard-capability"
export type { ClipboardCapability } from "./clipboard-capability"
