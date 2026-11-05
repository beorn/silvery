# @silvery/schemes

84 terminal color schemes with detection, builders, validation and Base16 import/export tools.

```ts
import { nord } from "@silvery/schemes"
import { sterling } from "@silvery/design"

const theme = sterling.deriveFromScheme(nord)
```

Sterling tokens and CSS live in `@silvery/design`. Terminal constructors remain in `@silvery/ansi`. Applications can import design and scheme exports together through `silvery/theme`.

See the [theme reference](https://silvery.dev/reference/theme).
