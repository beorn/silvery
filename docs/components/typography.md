# Typography

Semantic text hierarchy for TUIs. Since terminals can't vary font size, these presets use color + bold/dim/italic to create clear visual levels.

Typography presets accept `color` overrides. Their defaults come from the
theme's variants; see the [styling guide](/guide/styling).

```tsx
import {
  H1,
  H2,
  H3,
  P,
  Lead,
  Muted,
  Small,
  Strong,
  Em,
  Code,
  Kbd,
  Blockquote,
  CodeBlock,
  SyntaxHighlighter,
  HR,
  UL,
  OL,
  LI,
} from "silvery"
```

## Headings

| Component | Default Style                      | Use For           |
| --------- | ---------------------------------- | ----------------- |
| `<H1>`    | `$fg-accent` + bold                | Page title        |
| `<H2>`    | `mix($fg-accent, $fg, 50%)` + bold | Section heading   |
| `<H3>`    | inherited foreground + bold        | Group heading     |
| `<H4>`    | `$fg-muted` + bold                 | Sub-group heading |
| `<H5>`    | `$fg-muted` + italic               | Minor heading     |
| `<H6>`    | `$fg-muted` + dim                  | Deepest heading   |

```tsx
<H1>Settings</H1>                    // $fg-accent + bold
<H2>General</H2>                     // halfway from accent to foreground + bold
<H3>Appearance</H3>                   // bold
<H1 color="$fg-success">Panel A</H1> // override color for differentiation
```

Headings have no underline by default. Their color takes precedence over nested
inline styling; an explicit `color` overrides the heading's default.

## Body Text

| Component | Default Style                         | Use For                         |
| --------- | ------------------------------------- | ------------------------------- |
| `<P>`     | `mix($fg, $fg-muted, 12.5%)`          | Body text                       |
| `<Lead>`  | `$fg-muted` + italic                  | Introductory/lead text          |
| `<Muted>` | `$fg-muted`                           | Secondary/supporting text       |
| `<Small>` | `$fg-muted` (pre-dimmed at truecolor) | Fine print, captions, footnotes |

```tsx
<P>Use dark colors for the UI.</P>    // slightly muted body text
<Lead>Welcome to the app</Lead>       // $fg-muted + italic
<Muted>Requires restart</Muted>       // $fg-muted
<Small>Last updated 2 hours ago</Small> // $fg-muted (pre-dimmed)
```

## Inline Emphasis

| Component  | Default Style                     | Use For                |
| ---------- | --------------------------------- | ---------------------- |
| `<Strong>` | bold + brighter body foreground   | Inline strong emphasis |
| `<Em>`     | italic + brighter body foreground | Inline emphasis        |

```tsx
<Text variant="body">
  This is <Strong>important</Strong> and <Em>emphasized</Em>.
</Text>
```

Both emphasis presets blend halfway from the body color back toward `$fg`.
Use `<Text variant="body">` for body styling without a `<P>` wrapper; bare
`<Text>` still inherits its foreground.

## Code & Keys

| Component     | Default Style                                       | Use For                 |
| ------------- | --------------------------------------------------- | ----------------------- |
| `<Code>`      | `mix($fg-muted, $fg-link, 20%)`, no chip or padding | Inline code             |
| `<Kbd>`       | `$bg-muted` + bold                                  | Keyboard shortcut badge |
| `<CodeBlock>` | `$bg-surface-subtle` padded surface                 | Multi-line code block   |

```tsx
<Code>npm install silvery</Code>      // inline code
<Kbd>Ctrl+C</Kbd>                      // keyboard shortcut
<CodeBlock>{"const x = 1\nconst y = 2"}</CodeBlock>
<SyntaxHighlighter language="typescript" code={"const answer = 42"} />
```

`<CodeBlock>` starts expanded, with two cells of horizontal padding and one
blank row above and below the content. Plain code is halfway between `$fg` and
`$fg-muted`. There is no border or rail. Hover reveals a faint label in the top
padding row without changing the expanded background. Click to collapse to one
line: a hanging `▸` followed by the label. Click again to expand; selecting text
does not collapse the block. Collapsed blocks may highlight on hover.

Use `label` to name the block (default `text`), `defaultExpanded` for its initial
state, or `expanded` and `onExpandedChange` for controlled state. `content`
accepts rendered content instead of plain `children`.

`<SyntaxHighlighter>` reuses this frame with a language label. It preserves
authored lines and blends syntax token colors halfway toward the plain-code
foreground. `bare` renders only the source, for an existing frame such as a
frontmatter panel; it does not add another frame or disclosure.

`DocumentView` outdents code surfaces so source text aligns with prose. Below
the `md` breakpoint (90 columns), it uses the available width while preserving
the left marker gutter and one trailing cell. Generic `<CodeBlock>` fills its
container by default and leaves document gutters to its caller.

Inline code and links have no underline by default. Links use `$fg-link` and
brighten on plain hover; inline code is muted and non-interactive. An explicit
`color` on `<Code>` still wins. `<Kbd>` keeps its padded background badge.

## Block Elements

| Component      | Default Style                            | Use For         |
| -------------- | ---------------------------------------- | --------------- |
| `<Blockquote>` | `$fg-muted` italic body, inset two cells | Quotations      |
| `<HR>`         | `$border-default` dashes                 | Horizontal rule |

```tsx
<Blockquote>Less is more.</Blockquote>
<HR />
```

`<Blockquote>` has a two-cell left inset and no border or text prefix. Wrapped
rows keep the same inset, muted foreground, and italic styling.

## Lists

Lists support nesting via `UL`/`OL` containers.

| Component | Style                    | Use For        |
| --------- | ------------------------ | -------------- |
| `<UL>`    | container                | Unordered list |
| `<OL>`    | container (auto-numbers) | Ordered list   |
| `<LI>`    | bullet/number + indented | List item      |

```tsx
<UL>
  <LI>First item</LI>
  <LI>Second item
    <UL>
      <LI>Nested bullet</LI>
    </UL>
  </LI>
</UL>

<OL>
  <LI>Step one</LI>
  <LI>Step two</LI>
</OL>
```

Every unordered depth uses the same small filled circle, `•`; indentation
expresses nesting. Ordered lists retain their numbers.

## Props

### TypographyProps

Inline typography presets accept `TextProps` plus children:

```typescript
interface TypographyProps extends Omit<TextProps, "children"> {
  children?: ReactNode
  color?: string // Override the default color
}
```

`CodeBlock` instead accepts Box geometry props plus the disclosure props above.

The `color` prop overrides the default semantic color, useful for panel differentiation:

```tsx
<H1 color="$fg-success">Success Panel</H1>
<H1 color="$fg-warning">Warning Panel</H1>
```
