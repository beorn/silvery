/**
 * Toast/Notification Component + useToast Hook
 *
 * Provides a toast notification system with auto-dismiss capability.
 * `useToast()` returns `{ toast, toasts, dismiss }`. Toasts render as a
 * vertical stack and auto-dismiss after a configurable duration.
 *
 * Usage:
 * ```tsx
 * function App() {
 *   const { toast, toasts } = useToast()
 *
 *   return (
 *     <Box flexDirection="column">
 *       <Button label="Save" onPress={() => {
 *         toast({ title: "Saved", variant: "success", duration: 3000 })
 *       }} />
 *       <ToastContainer toasts={toasts} />
 *     </Box>
 *   )
 * }
 * ```
 */
import React, { useCallback, useEffect, useRef, useState } from "react"
import { Box } from "@silvery/react/components/Box"
import { Text } from "@silvery/react/components/Text"

// =============================================================================
// Types
// =============================================================================

export type ToastVariant = "default" | "success" | "error" | "warning" | "info"

export interface ToastData {
  /** Unique toast ID (auto-generated if not provided) */
  id: string
  /** Toast title text */
  title: string
  /** Optional description text */
  description?: string
  /** Visual variant (default: "default") */
  variant: ToastVariant
  /** Auto-dismiss duration in ms (default: 3000, 0 = no auto-dismiss) */
  duration: number
}

export interface ToastOptions {
  /** Toast title text */
  title: string
  /** Optional description text */
  description?: string
  /** Visual variant (default: "default") */
  variant?: ToastVariant
  /** Auto-dismiss duration in ms (default: 3000, 0 = no auto-dismiss) */
  duration?: number
}

export interface UseToastResult {
  /** Show a new toast notification */
  toast: (options: ToastOptions) => string
  /** Currently visible toasts */
  toasts: ToastData[]
  /** Dismiss a specific toast by ID */
  dismiss: (id: string) => void
  /** Dismiss all toasts */
  dismissAll: () => void
}

export interface ToastContainerProps {
  /** Toasts to render */
  toasts: ToastData[]
  /** Maximum visible toasts (default: 5) */
  maxVisible?: number
}

export interface ToastItemProps {
  /** Toast data to render */
  toast: ToastData
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_DURATION = 3000

const VARIANT_COLORS: Record<ToastVariant, string> = {
  default: "$fg",
  success: "$success",
  error: "$error",
  warning: "$warning",
  info: "$info",
}

const VARIANT_ICONS: Record<ToastVariant, string> = {
  default: "i",
  success: "+",
  error: "x",
  warning: "!",
  info: "i",
}

// =============================================================================
// Hook
// =============================================================================

let nextToastId = 0

/**
 * Hook for managing toast notifications.
 *
 * Returns a `toast()` function to create notifications, the current list
 * of `toasts`, and `dismiss`/`dismissAll` functions for manual removal.
 * Toasts auto-dismiss after `duration` ms (default: 3000).
 */
export function useToast(): UseToastResult {
  const [toasts, setToasts] = useState<ToastData[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const dismissAll = useCallback(() => {
    setToasts([])
    for (const timer of timersRef.current.values()) {
      clearTimeout(timer)
    }
    timersRef.current.clear()
  }, [])

  const toast = useCallback(
    (options: ToastOptions): string => {
      const id = `toast-${++nextToastId}`
      const data: ToastData = {
        id,
        title: options.title,
        description: options.description,
        variant: options.variant ?? "default",
        duration: options.duration ?? DEFAULT_DURATION,
      }

      setToasts((prev) => [...prev, data])

      if (data.duration > 0) {
        const timer = setTimeout(() => {
          dismiss(id)
        }, data.duration)
        timersRef.current.set(id, timer)
      }

      return id
    },
    [dismiss],
  )

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }
      timers.clear()
    }
  }, [])

  return { toast, toasts, dismiss, dismissAll }
}

// =============================================================================
// Components
// =============================================================================

/**
 * Single toast notification item.
 *
 * Renders a bordered box with variant-colored icon, title, and optional
 * description text.
 */
export function ToastItem({ toast }: ToastItemProps): React.ReactElement {
  const color = VARIANT_COLORS[toast.variant]
  const icon = VARIANT_ICONS[toast.variant]

  return (
    <Box borderStyle="single" borderColor="$border" paddingX={1} backgroundColor="$surface-bg">
      <Text color={color} bold>
        [{icon}]
      </Text>
      <Text> {toast.title}</Text>
      {toast.description && <Text color="$muted"> {toast.description}</Text>}
    </Box>
  )
}

/**
 * Container that renders a stack of toast notifications.
 *
 * Place at the bottom of your layout to show toasts as they appear.
 */
export function ToastContainer({
  toasts,
  maxVisible = 5,
}: ToastContainerProps): React.ReactElement {
  const visible = toasts.slice(-maxVisible)

  return (
    <Box flexDirection="column">
      {visible.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </Box>
  )
}
