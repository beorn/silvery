export type ImagePixelSize = {
  readonly width: number
  readonly height: number
}

export type ImageCellRect = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type ImageSourceRect = {
  readonly x?: number
  readonly y?: number
  readonly width?: number
  readonly height?: number
}

export type ImagePixelOffset = {
  readonly x?: number
  readonly y?: number
}

export type ImageViewport = {
  readonly width: number
  readonly height: number
}

export type VisibleImagePlacement = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly sourceRect?: ImageSourceRect
  readonly pixelOffset?: ImagePixelOffset
}

export type PreviousImagePlacement = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly placementKey: string
}

export type KittyImagePlacementPlan =
  | { readonly kind: "noop" }
  | { readonly kind: "delete-placement" }
  | {
      readonly kind: "place"
      readonly placement: VisibleImagePlacement
      readonly placementKey: string
      readonly transmit: boolean
      readonly deleteImageBeforeTransmit: boolean
    }

const CURSOR_HIDE = "\x1b[?25l"
const CURSOR_SHOW = "\x1b[?25h"
const CURSOR_SAVE = "\x1b7"
const CURSOR_RESTORE = "\x1b8"

export function withCursorPreserved(seq: string): string {
  return `${CURSOR_HIDE}${CURSOR_SAVE}${seq}${CURSOR_RESTORE}${CURSOR_SHOW}`
}

export function computeVisibleImagePlacement({
  rect,
  imagePixels,
  sourceRect,
  pixelOffset,
  viewport,
}: {
  readonly rect: ImageCellRect
  readonly imagePixels?: ImagePixelSize | null
  readonly sourceRect?: ImageSourceRect
  readonly pixelOffset?: ImagePixelOffset
  readonly viewport?: ImageViewport | null
}): VisibleImagePlacement | null {
  if (rect.width <= 0 || rect.height <= 0) return null
  if (rect.x + rect.width <= 0 || rect.y + rect.height <= 0) return null
  if (viewport && (rect.x >= viewport.width || rect.y >= viewport.height)) return null

  const leftClip = Math.max(0, -rect.x)
  const topClip = Math.max(0, -rect.y)
  const rightClip = viewport ? Math.max(0, rect.x + rect.width - viewport.width) : 0
  const bottomClip = viewport ? Math.max(0, rect.y + rect.height - viewport.height) : 0
  const visibleWidth = rect.width - leftClip - rightClip
  const visibleHeight = rect.height - topClip - bottomClip
  if (visibleWidth <= 0 || visibleHeight <= 0) return null

  const placement: VisibleImagePlacement = {
    x: Math.max(0, rect.x),
    y: Math.max(0, rect.y),
    width: visibleWidth,
    height: visibleHeight,
    ...(pixelOffset ? { pixelOffset } : {}),
  }

  if (!imagePixels || (topClip === 0 && leftClip === 0 && rightClip === 0 && bottomClip === 0)) {
    return sourceRect ? { ...placement, sourceRect } : placement
  }

  const srcX = sourceRect?.x ?? 0
  const srcY = sourceRect?.y ?? 0
  const srcWidth = sourceRect?.width ?? imagePixels.width
  const srcHeight = sourceRect?.height ?? imagePixels.height
  const pixelsPerCol = srcWidth / Math.max(1, rect.width)
  const pixelsPerRow = srcHeight / Math.max(1, rect.height)

  return {
    ...placement,
    sourceRect: {
      x: Math.round(srcX + leftClip * pixelsPerCol),
      y: Math.round(srcY + topClip * pixelsPerRow),
      width: Math.max(1, Math.round(visibleWidth * pixelsPerCol)),
      height: Math.max(1, Math.round(visibleHeight * pixelsPerRow)),
    },
  }
}

export function imagePlacementKey({
  placementId,
  zIndex,
  pixelOffset,
  sourceRect,
  virtualPlacement,
}: {
  readonly placementId?: number
  readonly zIndex?: number
  readonly pixelOffset?: ImagePixelOffset
  readonly sourceRect?: ImageSourceRect
  readonly virtualPlacement?: boolean
}): string {
  return JSON.stringify({
    placementId,
    zIndex,
    pixelOffset,
    sourceRect,
    virtualPlacement,
  })
}

export function planKittyImagePlacement({
  rect,
  imagePixels,
  sourceRect,
  pixelOffset,
  viewport,
  placementId,
  zIndex,
  virtualPlacement,
  previousPlacement,
  srcChanged,
}: {
  readonly rect: ImageCellRect
  readonly imagePixels?: ImagePixelSize | null
  readonly sourceRect?: ImageSourceRect
  readonly pixelOffset?: ImagePixelOffset
  readonly viewport?: ImageViewport | null
  readonly placementId?: number
  readonly zIndex?: number
  readonly virtualPlacement?: boolean
  readonly previousPlacement: PreviousImagePlacement | null
  readonly srcChanged: boolean
}): KittyImagePlacementPlan {
  const placement = computeVisibleImagePlacement({
    rect,
    imagePixels,
    sourceRect,
    pixelOffset,
    viewport,
  })
  if (!placement) return previousPlacement ? { kind: "delete-placement" } : { kind: "noop" }

  const placementKey = imagePlacementKey({
    placementId,
    zIndex,
    pixelOffset: placement.pixelOffset,
    sourceRect: placement.sourceRect,
    virtualPlacement,
  })

  const unchanged =
    previousPlacement !== null &&
    previousPlacement.x === placement.x &&
    previousPlacement.y === placement.y &&
    previousPlacement.width === placement.width &&
    previousPlacement.height === placement.height &&
    previousPlacement.placementKey === placementKey

  if (unchanged && !srcChanged) return { kind: "noop" }

  return {
    kind: "place",
    placement,
    placementKey,
    transmit: srcChanged,
    deleteImageBeforeTransmit: srcChanged && previousPlacement !== null,
  }
}
