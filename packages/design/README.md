# @silvery/design

Sterling design tokens, theme factories, contrast helpers and CSS. Depends only on `@silvery/color` and works without a terminal or DOM.

```ts
import { sterling, themeCss, THEME_CSS_TOKENS } from "@silvery/design"

const theme = sterling.defaults("dark")
const css = themeCss()
```

`themeCss()` registers every flat token and categorical hue as an inherited CSS color, then selects light and dark values through `light-dark()`. Pass `{ light, dark }` to use a custom theme pair. The page controls its supported modes with `color-scheme`.

See the [Sterling reference](https://silvery.dev/reference/sterling) for theme factories, token names and migration guidance. Terminal scheme catalogs and tooling live in `@silvery/schemes`; terminal detection and constructors live in `@silvery/ansi`.
