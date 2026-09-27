import type { ReactElement } from "react"

/** The render options ListView cache capture needs from the static renderer. */
export interface ListViewCacheRenderOptions {
  width: number
  plain: false
  trimTrailingWhitespace: true
  trimEmptyLines: false
}

/** Optional React-subtree renderer used by terminal ListView cache capture. */
export type ListViewCacheRenderer = (
  element: ReactElement,
  options: ListViewCacheRenderOptions,
) => string

let cacheRenderer: ListViewCacheRenderer | undefined

/**
 * Install the cache renderer and return a restoration callback.
 *
 * The regular terminal/root entry installs `renderStringSync`. Browser-only
 * entries leave the capability absent and ListView keeps its plain-text
 * fallback without importing terminal rendering code.
 */
export function setListViewCacheRenderer(renderer: ListViewCacheRenderer | undefined): () => void {
  const previous = cacheRenderer
  cacheRenderer = renderer
  return () => {
    if (cacheRenderer === renderer) cacheRenderer = previous
  }
}

/** Return the installed cache renderer, if the active entry provides one. */
export function getListViewCacheRenderer(): ListViewCacheRenderer | undefined {
  return cacheRenderer
}
