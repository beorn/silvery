# Typography

Semantic text hierarchy for TUIs. Since terminals can't vary font size, these presets use color + bold/dim/italic to create clear visual levels.

All components accept an optional `color` prop to override the default color.

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
  HR,
  UL,
  OL,
  LI,
} from "silvery"
```

## Headings

| Component | Default Style     | Use For                                  |
| --------- | ----------------- | ---------------------------------------- |
| `<H1>`    | `$primary` + bold | Page title, maximum emphasis             |
| `<H2>`    | `$accent` + bold  | Section heading, contrasts with H1       |
| `<H3>`    | bold (no color)   | Group heading, stands out without accent |

```tsx
<H1>Settings</H1>                    // $primary + bold
<H2>General</H2>                      // $accent + bold
<H3>Appearance</H3>                   // bold
<H1 color="$success">Panel A</H1>    // override color for differentiation
```

## Body Text

| Component | Default Style     | Use For                         |
| --------- | ----------------- | ------------------------------- |
| `<P>`     | plain text        | Body text (semantic wrapper)    |
| `<Lead>`  | `$muted` + italic | Introductory/lead text          |
| `<Muted>` | `$muted`          | Secondary/supporting text       |
| `<Small>` | `$muted` + dim    | Fine print, captions, footnotes |

```tsx
<P>Use dark colors for the UI.</P>    // plain body text
<Lead>Welcome to the app</Lead>       // $muted + italic
<Muted>Requires restart</Muted>       // $muted
<Small>Last updated 2 hours ago</Small> // $muted + dim
```

## Inline Emphasis

| Component  | Default Style | Use For                |
| ---------- | ------------- | ---------------------- |
| `<Strong>` | bold          | Inline strong emphasis |
| `<Em>`     | italic        | Inline emphasis        |

```tsx
<Text>
  This is <Strong>important</Strong> and <Em>emphasized</Em>.
</Text>
```

## Code & Keys

| Component     | Default Style         | Use For                 |
| ------------- | --------------------- | ----------------------- |
| `<Code>`      | `$mutedbg` background | Inline code             |
| `<Kbd>`       | `$mutedbg` + bold     | Keyboard shortcut badge |
| `<CodeBlock>` | `$border` left border | Multi-line code block   |

```tsx
<Code>npm install silvery</Code>      // inline code
<Kbd>Ctrl+C</Kbd>                      // keyboard shortcut
<CodeBlock>{"const x = 1\nconst y = 2"}</CodeBlock>
```

## Block Elements

| Component      | Default Style            | Use For         |
| -------------- | ------------------------ | --------------- |
| `<Blockquote>` | `$muted` border + italic | Quotations      |
| `<HR>`         | `$border` dashes         | Horizontal rule |

```tsx
<Blockquote>Less is more.</Blockquote>
<HR />
```

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

Bullet styles vary by nesting depth: `•` `◦` `▸` `-`.

## Props

### TypographyProps

All typography components share this interface:

```typescript
interface TypographyProps {
  children?: ReactNode
  color?: string // Override the default color
}
```

The `color` prop overrides the default semantic color, useful for panel differentiation:

```tsx
<H1 color="$success">Success Panel</H1>
<H1 color="$warning">Warning Panel</H1>
```

