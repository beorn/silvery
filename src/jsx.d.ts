/**
 * JSX type declarations for Inkx custom host elements.
 *
 * This declares the 'inkx-box' and 'inkx-text' intrinsic elements that the
 * React reconciler handles. These are custom host elements, not DOM elements.
 */

import type { ReactNode, Ref } from "react"
import type { BoxProps, InkxNode, TextProps } from "./types.js"

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "inkx-box": BoxProps & { children?: ReactNode; ref?: Ref<InkxNode> }
      "inkx-text": TextProps & { children?: ReactNode; ref?: Ref<InkxNode> }
    }
  }
}
