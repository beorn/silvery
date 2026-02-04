/**
 * Inkx useFocus Hook
 *
 * Makes a component focusable within the Inkx focus system.
 * Compatible with Ink's useFocus API.
 */

import { useContext, useEffect, useMemo } from 'react';
import { FocusContext, StdinContext } from '../context.js';

// ============================================================================
// Focus ID Generator
// ============================================================================

let focusIdCounter = 0;

function generateFocusId(): string {
	return `focus-${++focusIdCounter}`;
}

/** Reset the focus ID counter (for testing only) */
export function resetFocusIdCounter(): void {
	focusIdCounter = 0;
}

// ============================================================================
// Types
// ============================================================================

export interface UseFocusOptions {
	/**
	 * Enable or disable focus for this component.
	 * When disabled, the component will be skipped during tab navigation.
	 * @default true
	 */
	isActive?: boolean;

	/**
	 * Auto-focus this component on mount.
	 * @default false
	 */
	autoFocus?: boolean;

	/**
	 * Custom ID for this focusable element.
	 * If not provided, a unique ID will be generated.
	 */
	id?: string;
}

export interface UseFocusResult {
	/** Whether this component is currently focused */
	isFocused: boolean;
	/** Focus this component */
	focus: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook that makes a component focusable.
 *
 * When the user presses Tab, focus will cycle through all focusable components
 * in the order they are rendered.
 *
 * @example
 * ```tsx
 * function FocusableButton({ label }: { label: string }) {
 *   const { isFocused } = useFocus();
 *
 *   return (
 *     <Text color={isFocused ? 'green' : undefined}>
 *       {isFocused ? '>' : ' '} {label}
 *     </Text>
 *   );
 * }
 * ```
 */
export function useFocus(options: UseFocusOptions = {}): UseFocusResult {
	const { isActive = true, autoFocus = false, id: customId } = options;

	const stdinContext = useContext(StdinContext);
	const focusContext = useContext(FocusContext);

	// Generate stable ID
	const id = useMemo(() => {
		return customId ?? generateFocusId();
	}, [customId]);

	// Register/unregister this focusable element
	useEffect(() => {
		if (!focusContext) return;

		focusContext.add(id, { autoFocus });
		return () => {
			focusContext.remove(id);
		};
	}, [id, autoFocus, focusContext]);

	// Activate/deactivate based on isActive
	useEffect(() => {
		if (!focusContext) return;

		if (isActive) {
			focusContext.activate(id);
		} else {
			focusContext.deactivate(id);
		}
	}, [isActive, id, focusContext]);

	// Set raw mode when active
	useEffect(() => {
		if (!stdinContext || !isActive || !stdinContext.isRawModeSupported) {
			return;
		}

		stdinContext.setRawMode(true);
		return () => {
			stdinContext.setRawMode(false);
		};
	}, [isActive, stdinContext]);

	// Focus function for this specific element
	const focus = useMemo(() => {
		return () => {
			focusContext?.focus(id);
		};
	}, [id, focusContext]);

	return {
		isFocused: Boolean(id) && focusContext?.activeId === id,
		focus,
	};
}
