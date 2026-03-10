# Static

Renders items that are written to the terminal once and never updated. Useful for logs, progress outputs, or any content that should remain visible while the main UI updates below.

## Import

```tsx
import { Static } from "silvery";
```

## Usage

```tsx
<Static items={logs}>{(log, index) => <Text key={index}>{log}</Text>}</Static>
```

## Props

| Prop       | Type                                    | Default  | Description                           |
| ---------- | --------------------------------------- | -------- | ------------------------------------- |
| `items`    | `T[]`                                   | required | Array of items to render              |
| `children` | `(item: T, index: number) => ReactNode` | required | Render function called for each item  |
| `style`    | `Record<string, unknown>`               | -        | Style props to apply to the container |

## Examples

### Log Output

```tsx
const [logs, setLogs] = useState<string[]>([]);

function addLog(message: string) {
  setLogs(prev => [...prev, `[${new Date().toISOString()}] ${message}`]);
}

// Logs appear above and scroll up as new ones are added
<Static items={logs}>
  {(log, index) => (
    <Text key={index} color="gray">{log}</Text>
  )}
</Static>

// Main UI stays at the bottom
<Box borderStyle="single">
  <Text>Current status: processing...</Text>
</Box>
```

Output (logs scroll up, status bar stays at bottom):

```
[2024-01-15T10:30:00.000Z] Starting process...
[2024-01-15T10:30:01.000Z] Loading configuration
[2024-01-15T10:30:02.000Z] Connected to server
┌─────────────────────────────────┐
│ Current status: processing...   │
└─────────────────────────────────┘
```

### Build Progress

```tsx
interface BuildStep {
  name: string;
  status: "success" | "error";
  duration: number;
}

const [completedSteps, setCompletedSteps] = useState<BuildStep[]>([]);

<Static items={completedSteps}>
  {(step, index) => (
    <Text key={index}>
      <Text color={step.status === "success" ? "green" : "red"}>
        {step.status === "success" ? "✓" : "✗"}
      </Text>
      {" "}{step.name} ({step.duration}ms)
    </Text>
  )}
</Static>

<Text>Building: {currentStep}...</Text>
```

Output:

```
✓ Compile TypeScript (1234ms)
✓ Bundle assets (567ms)
✓ Generate types (89ms)
Building: Running tests...
```

### Command Output

```tsx
interface OutputLine {
  type: "stdout" | "stderr";
  text: string;
}

const [output, setOutput] = useState<OutputLine[]>([]);

<Static items={output}>
  {(line, index) => (
    <Text key={index} color={line.type === "stderr" ? "red" : undefined}>
      {line.text}
    </Text>
  )}
</Static>

<Box>
  <Text dimColor>$ {command}</Text>
</Box>
```
