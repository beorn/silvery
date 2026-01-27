// Inkx - Next-gen terminal UI renderer with layout feedback
// Ink-compatible API

// Components
export { Box } from './components/Box.js';
export { Text } from './components/Text.js';
export { Newline } from './components/Newline.js';
export { Spacer } from './components/Spacer.js';
export { Static } from './components/Static.js';

// Hooks
export {
	// New API (preferred)
	useContentRect,
	useContentRectCallback,
	useScreenRect,
	useScreenRectCallback,
	// Deprecated aliases (backwards compatibility)
	useLayout,
	useLayoutCallback,
} from './hooks/useLayout.js';
export { useInput } from './hooks/useInput.js';
export { useApp } from './hooks/useApp.js';
export { useStdout } from './hooks/useStdout.js';
export { useStdin } from './hooks/useStdin.js';
export { useFocus, resetFocusIdCounter } from './hooks/useFocus.js';
export { useFocusManager } from './hooks/useFocusManager.js';

// Render
export {
	render,
	renderSync,
	setLayoutEngine,
	isLayoutEngineInitialized,
	// Yoga adapter
	createYogaEngine,
	initYogaEngine,
	YogaLayoutEngine,
	// Flexx adapter
	createFlexxEngine,
	FlexxLayoutEngine,
} from './render.js';
export { measureElement } from './measureElement.js';

// ANSI escape sequences for terminal control
export { ANSI } from './output.js';

// Layout engine types
export type {
	LayoutEngine,
	LayoutNode,
	LayoutConstants,
	MeasureFunc,
	MeasureMode,
} from './layout-engine.js';

// Types
export type { BoxProps } from './components/Box.js';
export type { TextProps } from './components/Text.js';
export type { Rect, ComputedLayout } from './hooks/useLayout.js';
export type { Key, InputHandler, UseInputOptions } from './hooks/useInput.js';
export type { UseAppResult } from './hooks/useApp.js';
export type { UseStdoutResult } from './hooks/useStdout.js';
export type { UseStdinResult } from './hooks/useStdin.js';
export type { UseFocusOptions, UseFocusResult } from './hooks/useFocus.js';
export type { UseFocusManagerResult } from './hooks/useFocusManager.js';
export type { RenderOptions, Instance, RenderMode } from './render.js';
export type { MeasureElementOutput } from './measureElement.js';
export type { InkxNode } from './types.js';
