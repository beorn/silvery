/**
 * Inkx Hooks
 *
 * React hooks for building terminal UI applications.
 */

// Layout
export {
	useContentRect,
	useContentRectCallback,
	useScreenRect,
	type Rect,
} from './useLayout.js';

// Input
export {
	useInput,
	type Key,
	type InputHandler,
	type UseInputOptions,
} from './useInput.js';

// App
export { useApp, type UseAppResult } from './useApp.js';

// Stdio
export { useStdout, type UseStdoutResult } from './useStdout.js';
export { useStdin, type UseStdinResult } from './useStdin.js';

// Focus
export {
	useFocus,
	type UseFocusOptions,
	type UseFocusResult,
} from './useFocus.js';
export {
	useFocusManager,
	type UseFocusManagerResult,
} from './useFocusManager.js';

// Input Layer Stack
export {
	useInputLayer,
	useInputLayerContext,
	type InputLayerHandler,
} from './useInputLayer.js';
