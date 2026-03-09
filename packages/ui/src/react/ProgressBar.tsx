/**
 * React ProgressBar component for silvery/Ink TUI apps
 */

import React, { useState, useEffect, useRef } from "react"
import type { ProgressBarProps } from "../types.js"
import { getETA, DEFAULT_ETA_BUFFER_SIZE, type ETASample } from "../utils/eta"

/**
 * Progress bar component for React TUI apps
 *
 * @example
 * ```tsx
 * import { ProgressBar } from "@silvery/ui/react";
 *
 * function DownloadProgress({ current, total }) {
 *   return (
 *     <ProgressBar
 *       value={current}
 *       total={total}
 *       showPercentage
 *       showETA
 *     />
 *   );
 * }
 * ```
 */
export function ProgressBar({
  value,
  total,
  width = 40,
  showPercentage = true,
  showETA = false,
  label,
  color = "cyan",
}: ProgressBarProps): React.ReactElement {
  // ETA calculation state
  const [eta, setEta] = useState<string>("--:--")
  const etaBuffer = useRef<ETASample[]>([])

  // Update ETA buffer when value changes
  useEffect(() => {
    const now = Date.now()
    etaBuffer.current.push({ time: now, value })

    if (etaBuffer.current.length > DEFAULT_ETA_BUFFER_SIZE) {
      etaBuffer.current.shift()
    }

    // Calculate ETA using shared utility
    const result = getETA(etaBuffer.current, value, total)
    setEta(result.formatted)
  }, [value, total])

  const percent = total > 0 ? value / total : 0
  const percentDisplay = `${Math.round(percent * 100)}%`

  const filledWidth = Math.round(width * percent)
  const emptyWidth = width - filledWidth

  const bar = "█".repeat(filledWidth) + "░".repeat(emptyWidth)

  // Build the display parts
  const parts: string[] = []

  if (label) {
    parts.push(label)
  }

  parts.push(`[${bar}]`)

  if (showPercentage) {
    parts.push(percentDisplay.padStart(4))
  }

  if (showETA) {
    parts.push(`ETA: ${eta}`)
  }

  return (
    <span data-progressx-bar data-color={color} data-percent={percent}>
      {parts.join(" ")}
    </span>
  )
}

/**
 * Hook for progress bar state management
 *
 * @example
 * ```tsx
 * function MyProgress() {
 *   const { value, total, update, increment, eta, percent } = useProgressBar(100);
 *
 *   useEffect(() => {
 *     const timer = setInterval(() => increment(), 100);
 *     return () => clearInterval(timer);
 *   }, []);
 *
 *   return <Text>{percent}% - ETA: {eta}</Text>;
 * }
 * ```
 */
export function useProgressBar(initialTotal: number) {
  const [value, setValue] = useState(0)
  const [total, setTotal] = useState(initialTotal)
  const etaBuffer = useRef<ETASample[]>([])
  const [eta, setEta] = useState<string>("--:--")

  const update = (newValue: number) => {
    setValue(newValue)

    // Update ETA buffer
    const now = Date.now()
    etaBuffer.current.push({ time: now, value: newValue })
    if (etaBuffer.current.length > DEFAULT_ETA_BUFFER_SIZE) {
      etaBuffer.current.shift()
    }

    // Calculate ETA using shared utility
    const result = getETA(etaBuffer.current, newValue, total)
    setEta(result.formatted)
  }

  const increment = (amount = 1) => update(value + amount)

  const reset = (newTotal?: number) => {
    setValue(0)
    if (newTotal !== undefined) setTotal(newTotal)
    etaBuffer.current = []
    setEta("--:--")
  }

  const percent = total > 0 ? Math.round((value / total) * 100) : 0

  return {
    value,
    total,
    percent,
    eta,
    update,
    increment,
    reset,
    setTotal,
  }
}
