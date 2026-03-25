# Tabs

Tab bar with keyboard navigation and panel content switching. Uses a compound component pattern: `Tabs` > `TabList` + `TabPanel`.

## Import

```tsx
import { Tabs, TabList, Tab, TabPanel } from "silvery"
```

## Usage

```tsx
<Tabs defaultValue="general">
  <TabList>
    <Tab value="general">General</Tab>
    <Tab value="advanced">Advanced</Tab>
    <Tab value="about">About</Tab>
  </TabList>
  <TabPanel value="general">
    <Text>General settings...</Text>
  </TabPanel>
  <TabPanel value="advanced">
    <Text>Advanced settings...</Text>
  </TabPanel>
  <TabPanel value="about">
    <Text>About this app...</Text>
  </TabPanel>
</Tabs>
```

## Components

### Tabs (Root)

| Prop           | Type                      | Default    | Description                        |
| -------------- | ------------------------- | ---------- | ---------------------------------- |
| `defaultValue` | `string`                  | —          | Default active tab (uncontrolled)  |
| `value`        | `string`                  | —          | Active tab (controlled)            |
| `onChange`     | `(value: string) => void` | —          | Called when active tab changes     |
| `isActive`     | `boolean`                 | `true`     | Whether keyboard input is captured |
| `children`     | `ReactNode`               | _required_ | TabList + TabPanel components      |

### TabList

| Prop       | Type        | Default    | Description    |
| ---------- | ----------- | ---------- | -------------- |
| `children` | `ReactNode` | _required_ | Tab components |

Renders tabs in a horizontal row with a bottom border.

### Tab

| Prop       | Type        | Default    | Description           |
| ---------- | ----------- | ---------- | --------------------- |
| `value`    | `string`    | _required_ | Unique tab identifier |
| `children` | `ReactNode` | _required_ | Tab label content     |

Active tab is bold with `$primary` color; inactive tabs use `$muted`.

### TabPanel

| Prop       | Type        | Default    | Description                         |
| ---------- | ----------- | ---------- | ----------------------------------- |
| `value`    | `string`    | _required_ | Tab value this panel corresponds to |
| `children` | `ReactNode` | _required_ | Panel content                       |

Only renders its children when the corresponding tab is active.

## Keyboard Shortcuts

| Key           | Action                      |
| ------------- | --------------------------- |
| `Right` / `l` | Next tab (wraps around)     |
| `Left` / `h`  | Previous tab (wraps around) |

## Examples

### Controlled Tabs

```tsx
const [tab, setTab] = useState("files")

<Tabs value={tab} onChange={setTab}>
  <TabList>
    <Tab value="files">Files</Tab>
    <Tab value="search">Search</Tab>
  </TabList>
  <TabPanel value="files">
    <FileList />
  </TabPanel>
  <TabPanel value="search">
    <SearchPanel />
  </TabPanel>
</Tabs>
```

### Settings Panel

```tsx
<Tabs defaultValue="display">
  <TabList>
    <Tab value="display">Display</Tab>
    <Tab value="keys">Keybindings</Tab>
    <Tab value="theme">Theme</Tab>
  </TabList>
  <TabPanel value="display">
    <Text>Font size, line height, etc.</Text>
  </TabPanel>
  <TabPanel value="keys">
    <Text>Keyboard shortcut configuration</Text>
  </TabPanel>
  <TabPanel value="theme">
    <Text>Color scheme selection</Text>
  </TabPanel>
</Tabs>
```
