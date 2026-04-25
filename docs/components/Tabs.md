# Tabs

Tab bar with keyboard navigation and panel content switching. Uses compound component pattern: `Tabs` > `TabList` + `TabPanel`.

## Import

```tsx
import { Tabs, TabList, Tab, TabPanel } from "silvery"
```

## Tabs Props

| Prop           | Type                      | Default      | Description                                  |
| -------------- | ------------------------- | ------------ | -------------------------------------------- |
| `children`     | `ReactNode`               | **required** | Tab children (TabList + TabPanel components) |
| `defaultValue` | `string`                  | --           | Default active tab value (uncontrolled)      |
| `value`        | `string`                  | --           | Controlled active tab value                  |
| `onChange`     | `(value: string) => void` | --           | Called when the active tab changes           |
| `isActive`     | `boolean`                 | `true`       | Whether tab input is active                  |

## TabList Props

| Prop       | Type        | Default      | Description  |
| ---------- | ----------- | ------------ | ------------ |
| `children` | `ReactNode` | **required** | Tab children |

## Tab Props

| Prop       | Type        | Default      | Description           |
| ---------- | ----------- | ------------ | --------------------- |
| `value`    | `string`    | **required** | Unique tab identifier |
| `children` | `ReactNode` | **required** | Tab label content     |

## TabPanel Props

| Prop       | Type        | Default      | Description                         |
| ---------- | ----------- | ------------ | ----------------------------------- |
| `value`    | `string`    | **required** | Tab value this panel corresponds to |
| `children` | `ReactNode` | **required** | Panel content                       |

## Keyboard Shortcuts

| Key       | Action       |
| --------- | ------------ |
| Right / l | Next tab     |
| Left / h  | Previous tab |

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

## Rendering

Active tab is bold with `$fg-accent` color and underline. Inactive tabs use `$fg-muted`. TabPanel only renders children when the corresponding tab is active.

## See Also

- [Breadcrumb](./Breadcrumb.md) -- navigation breadcrumb trail
