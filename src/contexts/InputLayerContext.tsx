/**
 * InputLayerContext - DOM-style Input Event Bubbling
 *
 * Provides a stack-based input handling system where:
 * 1. Layers register synchronously via useLayoutEffect (before paint)
 * 2. Input dispatches to layers in LIFO order (most recent first)
 * 3. Handlers return true to consume, false to bubble to next layer
 *
 * This solves the race condition where dialog input handlers register
 * asynchronously via useEffect, causing early keystrokes to be lost.
 *
 * @example
 * ```tsx
 * // Dialog with text input
 * function Dialog() {
 *   useInputLayer('dialog-input', (input, key) => {
 *     if (key.backspace) { ... return true }  // consumed
 *     if (input >= ' ') { ... return true }   // consumed
 *     return false  // bubble (e.g., escape to parent)
 *   })
 * }
 * ```
 *
 * @see docs/future/inkx-command-api-research.md
 */

import type React from 'react';
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import type { Key } from '../hooks/useInput.js';
import { useInput } from '../hooks/useInput.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Input handler function type.
 * @param input - The input character(s)
 * @param key - Key modifier information
 * @returns true if the event was consumed, false to bubble to next layer
 */
export type InputLayerHandler = (input: string, key: Key) => boolean;

/**
 * A layer in the input stack.
 */
export interface InputLayer {
	/** Unique identifier for this layer (used for removal) */
	id: string;
	/** Handler function */
	handler: InputLayerHandler;
}

/**
 * Context value providing access to the input layer stack.
 */
export interface InputLayerContextValue {
	/**
	 * Push a layer onto the stack.
	 * Layers are processed in LIFO order (most recent first).
	 */
	push: (layer: InputLayer) => void;

	/**
	 * Remove a layer from the stack by ID.
	 */
	pop: (id: string) => void;

	/**
	 * Dispatch input to the layer stack.
	 * Walks stack from top to bottom, stopping when a handler returns true.
	 */
	dispatch: (input: string, key: Key) => void;
}

// =============================================================================
// Context
// =============================================================================

const InputLayerContext = createContext<InputLayerContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

export interface InputLayerProviderProps {
	children: React.ReactNode;
}

/**
 * Provides the input layer stack to child components.
 *
 * This provider:
 * 1. Maintains a stack of input layers
 * 2. Sets up a single useInput handler that dispatches to the stack
 * 3. Allows layers to be added/removed dynamically
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <InputLayerProvider>
 *       <Board />
 *     </InputLayerProvider>
 *   )
 * }
 * ```
 */
export function InputLayerProvider({ children }: InputLayerProviderProps): React.JSX.Element {
	// Use ref to avoid re-renders when layers change
	const layersRef = useRef<InputLayer[]>([]);

	const push = useCallback((layer: InputLayer) => {
		const existing = layersRef.current;
		const existingIndex = existing.findIndex((l) => l.id === layer.id);

		if (existingIndex >= 0) {
			// Update existing layer in place (preserve position)
			const updated = [...existing];
			updated[existingIndex] = layer;
			layersRef.current = updated;
		} else {
			// Add new layer at the end
			layersRef.current = [...existing, layer];
		}
	}, []);

	const pop = useCallback((id: string) => {
		layersRef.current = layersRef.current.filter((l) => l.id !== id);
	}, []);

	const dispatch = useCallback((input: string, key: Key) => {
		// Walk stack from first-registered (start) to last-registered (end).
		//
		// In React's commit phase, useLayoutEffect setup runs child-first:
		// - For <Parent><Child/></Parent>:
		// - Child's useLayoutEffect fires first -> pushes child layer
		// - Parent's useLayoutEffect fires second -> pushes parent layer
		// - Stack: [child, parent]
		//
		// To have child handle first (like DOM event bubbling where the
		// innermost/focused element handles events first), we process
		// from START (index 0) to END.
		const layers = layersRef.current;
		for (let i = 0; i < layers.length; i++) {
			const layer = layers[i];
			if (layer && layer.handler(input, key)) {
				// Handler consumed the event, stop bubbling
				return;
			}
		}
		// Event bubbled through all layers without being consumed
	}, []);

	// Single useInput at the root that dispatches to layer stack
	useInput((input, key) => {
		dispatch(input, key);
	});

	const contextValue = useMemo(() => ({ push, pop, dispatch }), [push, pop, dispatch]);

	return <InputLayerContext.Provider value={contextValue}>{children}</InputLayerContext.Provider>;
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Access the input layer context directly.
 *
 * Use this when you need programmatic access to dispatch or layer management.
 * Most components should use useInputLayer instead.
 *
 * @throws Error if used outside InputLayerProvider
 */
export function useInputLayerContext(): InputLayerContextValue {
	const ctx = useContext(InputLayerContext);
	if (!ctx) {
		throw new Error('useInputLayerContext must be used within an InputLayerProvider');
	}
	return ctx;
}

/**
 * Register an input layer with the stack.
 *
 * Uses useLayoutEffect for synchronous registration, ensuring the handler
 * is registered before any paint/commit phase. This solves the race condition
 * where async useEffect registration causes early keystrokes to be lost.
 *
 * @param id - Unique identifier for this layer
 * @param handler - Input handler function. Return true to consume, false to bubble.
 *
 * @example
 * ```tsx
 * function SearchInput() {
 *   const [value, setValue] = useState('')
 *
 *   useInputLayer('search-input', (input, key) => {
 *     if (key.backspace && value.length > 0) {
 *       setValue(v => v.slice(0, -1))
 *       return true
 *     }
 *     if (input.length === 1 && input >= ' ') {
 *       setValue(v => v + input)
 *       return true
 *     }
 *     return false  // Let escape, enter, etc. bubble
 *   })
 *
 *   return <Text>Search: {value}</Text>
 * }
 * ```
 */
export function useInputLayer(id: string, handler: InputLayerHandler): void {
	const ctx = useContext(InputLayerContext);

	// Use useLayoutEffect for synchronous registration
	// This ensures the handler is registered before the component's first paint
	useLayoutEffect(() => {
		if (!ctx) {
			// Not inside InputLayerProvider - silently no-op
			// This allows components to work in both layered and non-layered contexts
			return;
		}

		ctx.push({ id, handler });
		return () => {
			ctx.pop(id);
		};
	}, [ctx, id, handler]);
}

// =============================================================================
// Exports
// =============================================================================

export { InputLayerContext };
