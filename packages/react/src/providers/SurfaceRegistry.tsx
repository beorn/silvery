/**
 * SurfaceRegistry — tracks mounted TextSurfaces for app-global search + selection.
 *
 * Internal provider. Components register their TextSurface on mount and
 * unregister on unmount. SearchProvider and SelectionProvider use the
 * registry to find the right surface to operate on.
 */

import React, { createContext, useCallback, useContext, useMemo, useRef } from "react"
import type { TextSurface } from "@silvery/term/text-surface"
import type { ReactNode, ReactElement } from "react"

// ============================================================================
// Types
// ============================================================================

export type SurfaceRect = { x: number; y: number; width: number; height: number }

interface RegisteredSurface {
  surface: TextSurface
  getRect?: () => SurfaceRect | null
}

export interface SurfaceRegistryValue {
  /** Register a surface with optional screen geometry. Call on mount. */
  register(surface: TextSurface, getRect?: () => SurfaceRect | null): void
  /** Unregister a surface by id. Call on unmount. */
  unregister(id: string): void
  /** Get a surface by id, or null if not registered. */
  getSurface(id: string): TextSurface | null
  /** Get the currently focused surface, or null. */
  getFocusedSurface(): TextSurface | null
  /** Get all registered surfaces. */
  getAllSurfaces(): TextSurface[]
  /** Set the focused surface by id (null to clear). */
  setFocused(id: string | null): void
  /** Subscribe to registry changes (register/unregister/focus). Returns unsubscribe fn. */
  subscribe(listener: () => void): () => void
  /** Hit-test: find the surface at screen coordinates, or null. */
  getSurfaceAt(x: number, y: number): TextSurface | null
}

// ============================================================================
// Context
// ============================================================================

const SurfaceRegistryContext = createContext<SurfaceRegistryValue | null>(null)

// ============================================================================
// Provider
// ============================================================================

export function SurfaceRegistryProvider({ children }: { children: ReactNode }): ReactElement {
  const surfacesRef = useRef(new Map<string, RegisteredSurface>())
  const focusedRef = useRef<string | null>(null)
  const listenersRef = useRef(new Set<() => void>())

  const notify = useCallback(() => {
    for (const listener of listenersRef.current) {
      listener()
    }
  }, [])

  const register = useCallback(
    (surface: TextSurface, getRect?: () => SurfaceRect | null) => {
      surfacesRef.current.set(surface.id, { surface, getRect })
      notify()
    },
    [notify],
  )

  const unregister = useCallback(
    (id: string) => {
      surfacesRef.current.delete(id)
      if (focusedRef.current === id) {
        focusedRef.current = null
      }
      notify()
    },
    [notify],
  )

  const getSurface = useCallback((id: string): TextSurface | null => {
    return surfacesRef.current.get(id)?.surface ?? null
  }, [])

  const getFocusedSurface = useCallback((): TextSurface | null => {
    if (!focusedRef.current) return null
    return surfacesRef.current.get(focusedRef.current)?.surface ?? null
  }, [])

  const getAllSurfaces = useCallback((): TextSurface[] => {
    return Array.from(surfacesRef.current.values()).map((entry) => entry.surface)
  }, [])

  const setFocused = useCallback(
    (id: string | null) => {
      focusedRef.current = id
      notify()
    },
    [notify],
  )

  const subscribe = useCallback((listener: () => void): (() => void) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  const getSurfaceAt = useCallback((x: number, y: number): TextSurface | null => {
    for (const entry of surfacesRef.current.values()) {
      const rect = entry.getRect?.()
      if (rect && x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height) {
        return entry.surface
      }
    }
    return null
  }, [])

  const value = useMemo<SurfaceRegistryValue>(
    () => ({
      register,
      unregister,
      getSurface,
      getFocusedSurface,
      getAllSurfaces,
      setFocused,
      subscribe,
      getSurfaceAt,
    }),
    [register, unregister, getSurface, getFocusedSurface, getAllSurfaces, setFocused, subscribe, getSurfaceAt],
  )

  return React.createElement(SurfaceRegistryContext.Provider, { value }, children)
}

// ============================================================================
// Hook
// ============================================================================

export function useSurfaceRegistry(): SurfaceRegistryValue {
  const ctx = useContext(SurfaceRegistryContext)
  if (!ctx) {
    throw new Error("useSurfaceRegistry must be used within a SurfaceRegistryProvider")
  }
  return ctx
}
