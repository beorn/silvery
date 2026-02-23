# Focus Hooks

Tree-based focus system hooks for managing focus state and navigation.

## Import

```tsx
import { useFocusable, useFocusWithin, useFocusManager } from "inkx"
```

## useFocusable

Returns focus state for the nearest focusable ancestor. The component must be rendered inside a `<Box focusable>` with a `testID` for identification.

### Usage

```tsx
function FocusableItem({ label }: { label: string }) {
  const { focused } = useFocusable()

  return (
    <Box testID="item" focusable>
      <Text color={focused ? "green" : undefined}>
        {focused ? "> " : "  "}
        {label}
      </Text>
    </Box>
  )
}
```

### Return Value

| Property      | Type                                              | Description                                |
| ------------- | ------------------------------------------------- | ------------------------------------------ |
| `focused`     | `boolean`                                         | Whether this component currently has focus |
| `focus`       | `() => void`                                      | Programmatically focus this component      |
| `blur`        | `() => void`                                      | Programmatically blur this component       |
| `focusOrigin` | `"keyboard" \| "mouse" \| "programmatic" \| null` | How focus was acquired                     |

## useFocusWithin

Returns whether any descendant of the specified Box (by `testID`) has focus.

### Usage

```tsx
function Sidebar() {
  const hasFocus = useFocusWithin("sidebar")

  return (
    <Box testID="sidebar" borderColor={hasFocus ? "blue" : "gray"}>
      <FocusableItem testID="item1" />
      <FocusableItem testID="item2" />
    </Box>
  )
}
```

### Parameters

| Parameter | Type     | Description                                |
| --------- | -------- | ------------------------------------------ |
| `testID`  | `string` | The testID of the Box to monitor for focus |

### Return Value

| Type      | Description                                           |
| --------- | ----------------------------------------------------- |
| `boolean` | Whether any descendant of the specified Box has focus |

## useFocusManager

Access the focus manager for programmatic focus control across all focusable components.

### Usage

```tsx
function App() {
  const { activeId, focused, focusNext, focusPrev, blur } = useFocusManager()

  return (
    <Box flexDirection="column">
      <Text>Active: {activeId ?? "none"}</Text>
      <FocusableItem label="First" />
      <FocusableItem label="Second" />
      <FocusableItem label="Third" />
    </Box>
  )
}
```

### Return Value

| Property        | Type                   | Description                            |
| --------------- | ---------------------- | -------------------------------------- |
| `activeId`      | `string \| null`       | testID of the currently focused node   |
| `activeElement` | `InkxNode \| null`     | The currently focused node             |
| `focused`       | `boolean`              | Whether any node has focus             |
| `focus`         | `(id: string) => void` | Focus a specific component by testID   |
| `focusNext`     | `() => void`           | Focus the next focusable component     |
| `focusPrev`     | `() => void`           | Focus the previous focusable component |
| `blur`          | `() => void`           | Clear focus from all components        |

## Box Focus Props

Focus behavior is configured via props on `<Box>`:

```tsx
<Box focusable>           {/* Can receive focus */}
<Box focusable autoFocus> {/* Focus on mount */}
<Box focusScope>          {/* Isolated Tab cycle within subtree */}
<Box onFocus={handler}>   {/* Focus event (bubbles) */}
<Box onBlur={handler}>    {/* Blur event (bubbles) */}
<Box onKeyDown={handler}> {/* Key event dispatched to focused node (bubbles) */}
```

| Prop             | Type       | Default | Description                                     |
| ---------------- | ---------- | ------- | ----------------------------------------------- |
| `focusable`      | `boolean`  | `false` | Node can receive focus                          |
| `autoFocus`      | `boolean`  | `false` | Focus this node on mount                        |
| `focusScope`     | `boolean`  | `false` | Tab cycles within this subtree                  |
| `nextFocusUp`    | `string`   | —       | testID to focus on Up arrow (explicit override) |
| `nextFocusDown`  | `string`   | —       | testID to focus on Down arrow                   |
| `nextFocusLeft`  | `string`   | —       | testID to focus on Left arrow                   |
| `nextFocusRight` | `string`   | —       | testID to focus on Right arrow                  |
| `onFocus`        | `function` | —       | Called when this node gains focus               |
| `onBlur`         | `function` | —       | Called when this node loses focus               |
| `onKeyDown`      | `function` | —       | Key event handler (bubble phase)                |

## Examples

### Tab Navigation

```tsx
function Button({ label }: { label: string }) {
  const { focused } = useFocusable()

  return (
    <Box testID={label} focusable borderStyle={focused ? "double" : "single"}>
      <Text inverse={focused}>{label}</Text>
    </Box>
  )
}

function Form() {
  return (
    <Box flexDirection="column" gap={1}>
      <Button label="Submit" />
      <Button label="Cancel" />
      <Button label="Help" />
    </Box>
  )
}
```

### Auto-Focus

```tsx
function SearchInput() {
  const { focused } = useFocusable()

  return (
    <Box testID="search" focusable autoFocus borderStyle={focused ? "double" : "single"}>
      <Text>Search: </Text>
      <Text inverse={focused}>_</Text>
    </Box>
  )
}
```

### Focus Scopes

```tsx
function Dialog() {
  return (
    <Box testID="dialog" focusScope borderStyle="double">
      {/* Tab cycles only within this dialog */}
      <Button label="OK" />
      <Button label="Cancel" />
    </Box>
  )
}
```

### Focus by ID

```tsx
function Navigation() {
  const { focus } = useFocusManager()

  useInput((input) => {
    if (input === "1") focus("first")
    if (input === "2") focus("second")
    if (input === "3") focus("third")
  })

  return (
    <Box flexDirection="column">
      <FocusableItem testID="first" label="First (1)" />
      <FocusableItem testID="second" label="Second (2)" />
      <FocusableItem testID="third" label="Third (3)" />
    </Box>
  )
}

function FocusableItem({ testID, label }: { testID: string; label: string }) {
  const { focused } = useFocusable()

  return (
    <Box testID={testID} focusable>
      <Text inverse={focused}>{label}</Text>
    </Box>
  )
}
```

### Focus Within for Panels

```tsx
function Panel({ id, children }: { id: string; children: React.ReactNode }) {
  const hasFocus = useFocusWithin(id)

  return (
    <Box testID={id} borderColor={hasFocus ? "cyan" : "gray"}>
      {children}
    </Box>
  )
}

function Layout() {
  return (
    <Box flexDirection="row">
      <Panel id="sidebar">
        <FocusableItem testID="nav1" label="Nav 1" />
        <FocusableItem testID="nav2" label="Nav 2" />
      </Panel>
      <Panel id="main">
        <FocusableItem testID="content1" label="Content 1" />
        <FocusableItem testID="content2" label="Content 2" />
      </Panel>
    </Box>
  )
}
```

### Action on Focus

```tsx
function MenuItem({ label, onSelect }: { label: string; onSelect: () => void }) {
  const { focused } = useFocusable()

  return (
    <Box
      testID={label}
      focusable
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect()
      }}
    >
      <Text color={focused ? "cyan" : undefined}>
        {focused ? "> " : "  "}
        {label}
      </Text>
    </Box>
  )
}
```

## Notes

- Focus is managed by a tree-based `FocusManager` that operates on the InkxNode render tree
- Tab moves forward through focusable nodes, Shift+Tab moves backward
- `focusScope` creates an isolated focus cycle (Tab does not leave the subtree)
- `autoFocus` on a Box focuses it when the component mounts
- `testID` identifies nodes for programmatic focus and `useFocusWithin`
- Click-to-focus is automatic when mouse events are enabled
- Directional navigation (`nextFocusUp`, etc.) allows explicit spatial focus movement
