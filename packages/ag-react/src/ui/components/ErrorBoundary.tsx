/**
 * ErrorBoundary Component
 *
 * Catches JavaScript errors in child component tree and displays a fallback UI.
 * Follows React's error boundary pattern using class component lifecycle methods.
 */

import { Component, type ErrorInfo, type ReactNode } from "react"
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"

// ============================================================================
// Props
// ============================================================================

export interface ErrorBoundaryProps {
  /** Child components to render */
  children: ReactNode
  /**
   * Fallback UI to render when an error is caught.
   * Can be a ReactNode or a function that receives error details.
   */
  fallback?: ReactNode | ((error: Error, errorInfo: ErrorInfo) => ReactNode)
  /**
   * Called when an error is caught.
   * Use for logging or error reporting.
   */
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  /**
   * Called when the error is reset (if resetKey or resetKeys change).
   */
  onReset?: () => void
  /**
   * When this key changes, the error boundary resets and tries to render children again.
   * Useful for "retry" functionality.
   */
  resetKey?: string | number
  /**
   * When any element in this array changes (shallow comparison), the error
   * boundary resets and re-mounts children. Useful when the recovery depends
   * on multiple values (e.g., route + data version).
   */
  resetKeys?: unknown[]
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
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
  override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })
    this.props.onError?.(error, errorInfo)
  }

  override componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (!this.state.hasError) return

    // Reset error state when resetKey changes
    const resetKeyChanged =
      this.props.resetKey !== undefined && prevProps.resetKey !== this.props.resetKey

    // Reset error state when any element in resetKeys changes (shallow comparison)
    const resetKeysChanged =
      this.props.resetKeys !== undefined &&
      (this.props.resetKeys.length !== prevProps.resetKeys?.length ||
        this.props.resetKeys.some((key, i) => key !== prevProps.resetKeys?.[i]))

    if (resetKeyChanged || resetKeysChanged) {
      this.props.onReset?.()
      this.setState({ hasError: false, error: null, errorInfo: null })
    }
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      const { fallback } = this.props
      const { error, errorInfo } = this.state

      // If fallback is a function, call it with error details.
      // errorInfo may be null on the first render (getDerivedStateFromError runs
      // before componentDidCatch), so provide a minimal default.
      if (typeof fallback === "function" && error) {
        const info = errorInfo ?? ({ componentStack: null } as unknown as ErrorInfo)
        return fallback(error, info)
      }

      // If fallback is provided, use it
      if (fallback !== undefined) {
        return fallback as ReactNode
      }

      // Default fallback: red bordered box with error message
      return (
        <Box borderStyle="single" borderColor="$error" padding={1} flexDirection="column">
          <Text color="$error" bold>
            Error
          </Text>
          {error && <Text color="$error">{error.message}</Text>}
          {errorInfo?.componentStack && (
            <Text color="$muted" wrap="truncate">
              {errorInfo.componentStack.split("\n").slice(0, 3).join("\n")}
            </Text>
          )}
        </Box>
      )
    }

    return this.props.children
  }
}
