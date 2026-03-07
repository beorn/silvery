/**
 * JSX type declarations for Hightea custom host elements.
 *
 * This declares the 'hightea-box' and 'hightea-text' intrinsic elements that the
 * React reconciler handles. These are custom host elements, not DOM elements.
 */

import type { ReactNode, Ref } from "react"
import type { BoxProps, TeaNode, TextProps } from "./types.js"

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "hightea-box": BoxProps & { children?: ReactNode; ref?: Ref<TeaNode> }
      "hightea-text": TextProps & { children?: ReactNode; ref?: Ref<TeaNode> }
    }
  }
}
