/**
 * ErrorBoundary Component
 *
 * Catches JavaScript errors in child component tree and displays a fallback UI.
 * Follows React's error boundary pattern using class component lifecycle methods.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Box } from './Box.js';
import { Text } from './Text.js';

// ============================================================================
// Props
// ============================================================================

export interface ErrorBoundaryProps {
	/** Child components to render */
	children: ReactNode;
	/**
	 * Fallback UI to render when an error is caught.
	 * Can be a ReactNode or a function that receives error details.
	 */
	fallback?: ReactNode | ((error: Error, errorInfo: ErrorInfo) => ReactNode);
	/**
	 * Called when an error is caught.
	 * Use for logging or error reporting.
	 */
	onError?: (error: Error, errorInfo: ErrorInfo) => void;
	/**
	 * Called when the error is reset (if resetKey changes).
	 */
	onReset?: () => void;
	/**
	 * When this key changes, the error boundary resets and tries to render children again.
	 * Useful for "retry" functionality.
	 */
	resetKey?: string | number;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
	errorInfo: ErrorInfo | null;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Error boundary that catches render errors in its children.
 *
 * @example
 * ```tsx
 * // Basic usage with default fallback
 * <ErrorBoundary>
 *   <MyComponent />
 * </ErrorBoundary>
 *
 * // Custom fallback
 * <ErrorBoundary fallback={<Text color="red">Something went wrong</Text>}>
 *   <MyComponent />
 * </ErrorBoundary>
 *
 * // Function fallback with error details
 * <ErrorBoundary
 *   fallback={(error, errorInfo) => (
 *     <Box flexDirection="column">
 *       <Text color="red">Error: {error.message}</Text>
 *       <Text dim>{errorInfo.componentStack}</Text>
 *     </Box>
 *   )}
 * >
 *   <MyComponent />
 * </ErrorBoundary>
 *
 * // With error reporting
 * <ErrorBoundary
 *   onError={(error, errorInfo) => {
 *     logErrorToService(error, errorInfo);
 *   }}
 * >
 *   <MyComponent />
 * </ErrorBoundary>
 *
 * // With reset functionality
 * const [resetKey, setResetKey] = useState(0);
 * <ErrorBoundary
 *   resetKey={resetKey}
 *   fallback={
 *     <Box>
 *       <Text color="red">Error!</Text>
 *       <Text> Press r to retry</Text>
 *     </Box>
 *   }
 *   onReset={() => console.log('Retrying...')}
 * >
 *   <MyComponent />
 * </ErrorBoundary>
 * // On 'r' key: setResetKey(k => k + 1)
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	state: ErrorBoundaryState = {
		hasError: false,
		error: null,
		errorInfo: null,
	};

	static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		this.setState({ errorInfo });
		this.props.onError?.(error, errorInfo);
	}

	componentDidUpdate(prevProps: ErrorBoundaryProps): void {
		// Reset error state when resetKey changes
		if (
			this.state.hasError &&
			prevProps.resetKey !== this.props.resetKey &&
			this.props.resetKey !== undefined
		) {
			this.props.onReset?.();
			this.setState({ hasError: false, error: null, errorInfo: null });
		}
	}

	render(): ReactNode {
		if (this.state.hasError) {
			const { fallback } = this.props;
			const { error, errorInfo } = this.state;

			// If fallback is a function, call it with error details
			if (typeof fallback === 'function' && error && errorInfo) {
				return fallback(error, errorInfo);
			}

			// If fallback is provided, use it
			if (fallback !== undefined) {
				return fallback;
			}

			// Default fallback: red bordered box with error message
			return (
				<Box borderStyle="single" borderColor="red" padding={1} flexDirection="column">
					<Text color="red" bold>
						Error
					</Text>
					{error && <Text color="red">{error.message}</Text>}
					{errorInfo?.componentStack && (
						<Text dim wrap="truncate">
							{errorInfo.componentStack.split('\n').slice(0, 3).join('\n')}
						</Text>
					)}
				</Box>
			);
		}

		return this.props.children;
	}
}
