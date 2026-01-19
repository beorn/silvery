# useFocus / useFocusManager

Create focusable components and manage focus navigation.

## Import

```tsx
import { useFocus, useFocusManager } from "inkx";
```

## useFocus

Makes a component focusable within the focus system.

### Usage

```tsx
function FocusableItem({ label }: { label: string }) {
  const { isFocused } = useFocus();

  return (
    <Text color={isFocused ? "green" : undefined}>
      {isFocused ? "> " : "  "}{label}
    </Text>
  );
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `isActive` | `boolean` | `true` | Enable/disable focus for this component |
| `autoFocus` | `boolean` | `false` | Auto-focus this component on mount |
| `id` | `string` | (random) | Custom ID for this focusable element |

### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `isFocused` | `boolean` | Whether this component is currently focused |
| `focus` | `() => void` | Focus this component programmatically |

## useFocusManager

Control focus management across all focusable components.

### Usage

```tsx
function App() {
  const { focusNext, focusPrevious } = useFocusManager();

  useInput((input, key) => {
    if (key.tab && key.shift) {
      focusPrevious();
    } else if (key.tab) {
      focusNext();
    }
  });

  return (
    <Box flexDirection="column">
      <FocusableItem label="First" />
      <FocusableItem label="Second" />
      <FocusableItem label="Third" />
    </Box>
  );
}
```

### Return Value

| Property | Type | Description |
|----------|------|-------------|
| `focusNext` | `() => void` | Focus the next focusable component |
| `focusPrevious` | `() => void` | Focus the previous focusable component |
| `focus` | `(id: string) => void` | Focus a specific component by ID |
| `enableFocus` | `() => void` | Enable focus management |
| `disableFocus` | `() => void` | Disable focus management |

## Examples

### Tab Navigation

```tsx
function Button({ label }: { label: string }) {
  const { isFocused } = useFocus();

  return (
    <Box borderStyle={isFocused ? "double" : "single"}>
      <Text inverse={isFocused}>{label}</Text>
    </Box>
  );
}

function Form() {
  const { focusNext, focusPrevious } = useFocusManager();

  useInput((input, key) => {
    if (key.tab && key.shift) {
      focusPrevious();
    } else if (key.tab) {
      focusNext();
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Button label="Submit" />
      <Button label="Cancel" />
      <Button label="Help" />
    </Box>
  );
}
```

### Auto-Focus

```tsx
function SearchInput() {
  const { isFocused } = useFocus({ autoFocus: true });

  return (
    <Box borderStyle={isFocused ? "double" : "single"}>
      <Text>Search: </Text>
      <Text inverse={isFocused}>_</Text>
    </Box>
  );
}
```

### Conditional Focus

```tsx
function DisableableButton({ label, disabled }: { label: string; disabled: boolean }) {
  const { isFocused } = useFocus({ isActive: !disabled });

  return (
    <Text
      color={disabled ? "gray" : isFocused ? "green" : undefined}
      dimColor={disabled}
    >
      {isFocused ? "> " : "  "}{label}
    </Text>
  );
}
```

### Focus by ID

```tsx
function Navigation() {
  const { focus } = useFocusManager();

  useInput((input) => {
    if (input === "1") focus("first");
    if (input === "2") focus("second");
    if (input === "3") focus("third");
  });

  return (
    <Box flexDirection="column">
      <FocusableWithId id="first" label="First (1)" />
      <FocusableWithId id="second" label="Second (2)" />
      <FocusableWithId id="third" label="Third (3)" />
    </Box>
  );
}

function FocusableWithId({ id, label }: { id: string; label: string }) {
  const { isFocused } = useFocus({ id });

  return (
    <Text inverse={isFocused}>{label}</Text>
  );
}
```

### Action on Focus

```tsx
function MenuItem({ label, onSelect }: { label: string; onSelect: () => void }) {
  const { isFocused } = useFocus();

  useInput((input, key) => {
    if (isFocused && key.return) {
      onSelect();
    }
  });

  return (
    <Text color={isFocused ? "cyan" : undefined}>
      {isFocused ? "> " : "  "}{label}
    </Text>
  );
}
```

## Notes

- Focus cycles through components in render order
- Tab moves forward, Shift+Tab moves backward
- Use `isActive: false` to skip a component during navigation
- Components with `autoFocus: true` receive focus on mount
- Custom IDs allow focusing specific components programmatically
