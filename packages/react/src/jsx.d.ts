/**
 * JSX type declarations for Silvery custom host elements.
 *
 * This declares the 'silvery-box' and 'silvery-text' intrinsic elements that the
 * React reconciler handles. These are custom host elements, not DOM elements.
 */

import type { ReactNode, Ref } from "react"
import type { BoxProps, TeaNode, TextProps } from "@silvery/tea/types"

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "silvery-box": BoxProps & { children?: ReactNode; ref?: Ref<TeaNode> }
      "silvery-text": TextProps & { children?: ReactNode; ref?: Ref<TeaNode> }
    }
  }
}
