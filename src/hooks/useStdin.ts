/**
 * Inkx useStdin Hook
 *
 * Provides access to the stdin stream and raw mode control.
 * Compatible with Ink's useStdin API.
 */

import { useContext } from 'react';
import { StdinContext } from '../context.js';

// ============================================================================
// Types
// ============================================================================

export interface UseStdinResult {
	/** The stdin stream */
	stdin: NodeJS.ReadStream;
	/** Whether raw mode is supported on this stdin */
	isRawModeSupported: boolean;
	/** Set raw mode on stdin */
	setRawMode: (value: boolean) => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for accessing the stdin stream.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { stdin, setRawMode, isRawModeSupported } = useStdin();
 *
 *   useEffect(() => {
 *     if (isRawModeSupported) {
 *       setRawMode(true);
 *       return () => setRawMode(false);
 *     }
 *   }, []);
 *
 *   return <Text>Raw mode: {isRawModeSupported ? 'enabled' : 'not supported'}</Text>;
 * }
 * ```
 */
export function useStdin(): UseStdinResult {
	const context = useContext(StdinContext);

	if (!context) {
		throw new Error('useStdin must be used within an Inkx application');
	}

	return {
		stdin: context.stdin,
		isRawModeSupported: context.isRawModeSupported,
		setRawMode: context.setRawMode,
	};
}
