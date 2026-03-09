/**
 * React context for progress state management
 */

import React, { createContext, useContext, useState, useCallback } from "react"
import type { SpinnerStyle } from "../types.js"
import { Spinner } from "./Spinner"

/** Progress context state */
interface ProgressContextState {
  /** Currently showing a spinner */
  isLoading: boolean
  /** Loading message */
  loadingText: string
  /** Spinner style */
  spinnerStyle: SpinnerStyle

  /** Show a spinner with message */
  showSpinner: (text: string, style?: SpinnerStyle) => void
  /** Hide the spinner */
  hideSpinner: () => void

  /** Progress bar state */
  progress: { current: number; total: number } | null
  /** Update progress */
  updateProgress: (current: number, total?: number) => void
  /** Clear progress */
  clearProgress: () => void
}

const ProgressContext = createContext<ProgressContextState | null>(null)

/**
 * Progress context provider
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <ProgressProvider>
 *       <MyApp />
 *     </ProgressProvider>
 *   );
 * }
 *
 * function DeepComponent() {
 *   const { showSpinner, hideSpinner } = useProgress();
 *
 *   const handleLoad = async () => {
 *     showSpinner("Loading...");
 *     await loadData();
 *     hideSpinner();
 *   };
 * }
 * ```
 */
export function ProgressProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [isLoading, setIsLoading] = useState(false)
  const [loadingText, setLoadingText] = useState("")
  const [spinnerStyle, setSpinnerStyle] = useState<SpinnerStyle>("dots")
  const [progress, setProgress] = useState<{
    current: number
    total: number
  } | null>(null)

  const showSpinner = useCallback((text: string, style: SpinnerStyle = "dots") => {
    setLoadingText(text)
    setSpinnerStyle(style)
    setIsLoading(true)
  }, [])

  const hideSpinner = useCallback(() => {
    setIsLoading(false)
    setLoadingText("")
  }, [])

  const updateProgress = useCallback((current: number, total?: number) => {
    setProgress((prev) => ({
      current,
      total: total ?? prev?.total ?? 100,
    }))
  }, [])

  const clearProgress = useCallback(() => {
    setProgress(null)
  }, [])

  const value: ProgressContextState = {
    isLoading,
    loadingText,
    spinnerStyle,
    showSpinner,
    hideSpinner,
    progress,
    updateProgress,
    clearProgress,
  }

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>
}

/**
 * Hook to access progress context
 *
 * @example
 * ```tsx
 * function LoadingOverlay() {
 *   const { isLoading, loadingText, spinnerStyle } = useProgress();
 *
 *   if (!isLoading) return null;
 *
 *   return <Spinner label={loadingText} style={spinnerStyle} />;
 * }
 * ```
 */
export function useProgress(): ProgressContextState {
  const context = useContext(ProgressContext)

  if (!context) {
    throw new Error("useProgress must be used within a ProgressProvider")
  }

  return context
}

/**
 * Component that renders spinner when loading
 *
 * @example
 * ```tsx
 * <ProgressProvider>
 *   <ProgressIndicator />
 *   <MainContent />
 * </ProgressProvider>
 * ```
 */
export function ProgressIndicator(): React.ReactElement | null {
  const { isLoading, loadingText, spinnerStyle } = useProgress()

  if (!isLoading) {
    return null
  }

  return <Spinner label={loadingText} style={spinnerStyle} />
}
