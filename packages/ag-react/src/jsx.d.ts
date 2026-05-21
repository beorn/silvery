/**
 * JSX type declarations for Silvery custom host elements.
 *
 * This declares the 'silvery-box' and 'silvery-text' intrinsic elements that the
 * React reconciler handles. These are custom host elements, not DOM elements.
 */

import type { ReactNode, Ref } from "react"
import type { BoxProps, AgNode, TextProps } from "@silvery/ag/types"
import type { ViewportProps } from "@silvery/ag/viewport-types"

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "silvery-box": BoxProps & { children?: ReactNode; ref?: Ref<AgNode> }
      "silvery-text": TextProps & { children?: ReactNode; ref?: Ref<AgNode> }
      // Viewport — leaf node (no children); see bead @km/silvery/15513.
      "silvery-viewport": ViewportProps & { ref?: Ref<AgNode> }
    }
  }
}
