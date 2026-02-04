/**
 * Inkx useStdout Hook
 *
 * Provides access to the stdout stream.
 * Compatible with Ink's useStdout API.
 */

import { useContext } from 'react';
import { StdoutContext } from '../context.js';

// ============================================================================
// Types
// ============================================================================

export interface UseStdoutResult {
	/** The stdout stream */
	stdout: NodeJS.WriteStream;
	/** Write to stdout */
	write: (data: string) => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for accessing the stdout stream.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { write } = useStdout();
 *
 *   useEffect(() => {
 *     write('Hello, world!\n');
 *   }, []);
 *
 *   return <Text>Check stdout</Text>;
 * }
 * ```
 */
export function useStdout(): UseStdoutResult {
	const context = useContext(StdoutContext);

	if (!context) {
		throw new Error('useStdout must be used within an Inkx application');
	}

	return {
		stdout: context.stdout,
		write: context.write,
	};
}
