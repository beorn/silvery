/**
 * JSX type declarations for Inkx custom host elements.
 *
 * This declares the 'inkx-box' and 'inkx-text' intrinsic elements that the
 * React reconciler handles. These are custom host elements, not DOM elements.
 */

import type { ReactNode } from "react";
import type { BoxProps, TextProps } from "./types.js";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "inkx-box": BoxProps & { children?: ReactNode };
      "inkx-text": TextProps & { children?: ReactNode };
    }
  }
}
