import type { HeightModel } from "./height-model"

export type Key = string | number
export type AxisUnit = number

export interface AnchorPoint<K extends Key = Key> {
  key: K
  offset: AxisUnit
}

export type Pin =
  | { kind: "top" }
  | { kind: "center" }
  | { kind: "bottom" }
  | { kind: "offset"; value: number; unit: "axis" | "fraction" }

export type ScrollPosition<K extends Key = Key> =
  | { kind: "anchored"; point: AnchorPoint<K>; pin: Pin }
  | { kind: "end" }

export interface ContentGeometry<K extends Key = Key> {
  readonly model: HeightModel
  keyAtIndex(index: number): K | null
  indexOfKey(key: K): number | null
  rowOfKey(key: K): number | null
  itemHeight(index: number): number
  anchorAtRow(row: number): AnchorPoint<K> | null
  totalRows(): number
  maxTopRow(viewportHeight: number): number
}

export interface ContentGeometryOptions<K extends Key = Key> {
  model: HeightModel
  keyAtIndex: (index: number) => K | null
}

export interface ViewportSpec {
  height: number
  fallbackTopRow?: number
}

export interface ResolvedScrollPosition<K extends Key = Key> {
  topRow: number
  position: ScrollPosition<K>
  fallbackUsed: boolean
}

export function createContentGeometry<K extends Key = Key>({
  model,
  keyAtIndex,
}: ContentGeometryOptions<K>): ContentGeometry<K> {
  let cachedVersion = -1
  let cachedKeyToIndex = new Map<K, number>()

  function keyToIndex(): ReadonlyMap<K, number> {
    if (cachedVersion === model.itemCount) return cachedKeyToIndex
    const next = new Map<K, number>()
    for (let index = 0; index < model.itemCount; index++) {
      const key = keyAtIndex(index)
      if (key !== null) next.set(key, index)
    }
    cachedVersion = model.itemCount
    cachedKeyToIndex = next
    return cachedKeyToIndex
  }

  function indexOfKey(key: K): number | null {
    return keyToIndex().get(key) ?? null
  }

  function rowOfKey(key: K): number | null {
    const index = indexOfKey(key)
    return index === null ? null : model.rowOfIndex(index)
  }

  function itemHeight(index: number): number {
    if (index < 0 || index >= model.itemCount) return 0
    return Math.max(0, model.prefixSum(index + 1) - model.prefixSum(index))
  }

  function anchorAtRow(row: number): AnchorPoint<K> | null {
    const index = model.indexAtRow(row)
    if (index === null) return null
    const key = keyAtIndex(index)
    if (key === null) return null
    return clampAnchorPoint(
      { key, offset: Math.max(0, row - model.rowOfIndex(index)) },
      itemHeight(index),
    )
  }

  function maxTopRow(viewportHeight: number): number {
    return Math.max(0, model.totalRows() - Math.max(0, viewportHeight))
  }

  return {
    model,
    keyAtIndex,
    indexOfKey,
    rowOfKey,
    itemHeight,
    anchorAtRow,
    totalRows: () => model.totalRows(),
    maxTopRow,
  }
}

export function resolvePinOffset(pin: Pin, viewportHeight: number): number {
  const height = Math.max(0, viewportHeight)
  switch (pin.kind) {
    case "top":
      return 0
    case "center":
      return height / 2
    case "bottom":
      return height
    case "offset":
      return pin.unit === "fraction" ? pin.value * height : pin.value
  }
}

export function clampAnchorPoint<K extends Key>(
  point: AnchorPoint<K>,
  itemHeight: number,
): AnchorPoint<K> {
  const maxOffset = Math.max(0, itemHeight - 1)
  return {
    key: point.key,
    offset: Math.max(0, Math.min(maxOffset, point.offset)),
  }
}

export function computeViewportTopFromAnchor<K extends Key>({
  point,
  pin,
  geometry,
  viewport,
}: {
  point: AnchorPoint<K>
  pin: Pin
  geometry: ContentGeometry<K>
  viewport: Pick<ViewportSpec, "height">
}): number | null {
  const index = geometry.indexOfKey(point.key)
  if (index === null) return null
  const clampedPoint = clampAnchorPoint(point, geometry.itemHeight(index))
  const anchorRow = geometry.model.rowOfIndex(index) + clampedPoint.offset
  const topRow = anchorRow - resolvePinOffset(pin, viewport.height)
  return clampTopRow(topRow, geometry.maxTopRow(viewport.height))
}

export function captureAnchorAtViewportY<K extends Key>({
  geometry,
  viewportTopRow,
  viewportY,
}: {
  geometry: ContentGeometry<K>
  viewportTopRow: number
  viewportY: number
}): AnchorPoint<K> | null {
  return geometry.anchorAtRow(viewportTopRow + viewportY)
}

export function reseedAnchorFromFallbackTop<K extends Key>({
  geometry,
  fallbackTopRow,
}: {
  geometry: ContentGeometry<K>
  fallbackTopRow: number
}): AnchorPoint<K> | null {
  return geometry.anchorAtRow(fallbackTopRow)
}

export function resolveScrollPositionTop<K extends Key>(
  position: ScrollPosition<K>,
  geometry: ContentGeometry<K>,
  viewport: ViewportSpec,
): ResolvedScrollPosition<K> {
  if (position.kind === "end") {
    return {
      topRow: geometry.maxTopRow(viewport.height),
      position,
      fallbackUsed: false,
    }
  }

  const anchoredTopRow = computeViewportTopFromAnchor({
    point: position.point,
    pin: position.pin,
    geometry,
    viewport,
  })
  if (anchoredTopRow !== null) {
    const index = geometry.indexOfKey(position.point.key)
    const point =
      index === null ? position.point : clampAnchorPoint(position.point, geometry.itemHeight(index))
    return {
      topRow: anchoredTopRow,
      position: { kind: "anchored", point, pin: position.pin },
      fallbackUsed: false,
    }
  }

  const fallbackTopRow = viewport.fallbackTopRow ?? 0
  const clampedFallbackTopRow = clampTopRow(fallbackTopRow, geometry.maxTopRow(viewport.height))
  const fallbackPoint = reseedAnchorFromFallbackTop({
    geometry,
    fallbackTopRow: clampedFallbackTopRow,
  })
  return {
    topRow: clampedFallbackTopRow,
    position:
      fallbackPoint === null
        ? position
        : { kind: "anchored", point: fallbackPoint, pin: position.pin },
    fallbackUsed: true,
  }
}

function clampTopRow(row: number, maxTopRow: number): number {
  if (!Number.isFinite(row)) return 0
  return Math.max(0, Math.min(maxTopRow, row))
}
