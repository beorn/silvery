# ScrollbackList

Declarative wrapper around `useScrollback`. Manages a list of items where completed items freeze into terminal scrollback. Items signal completion by calling `freeze()` from the `useScrollbackItem` hook.

The component enforces a contiguous prefix invariant: items freeze in order from the start.

## Import

```tsx
import { ScrollbackList } from "silvery"
```

## Props

| Prop           | Type                                           | Default                  | Description                           |
| -------------- | ---------------------------------------------- | ------------------------ | ------------------------------------- |
| `items`        | `T[]`                                          | **required**             | Array of items to render              |
| `children`     | `(item: T, index: number) => ReactNode`        | --                       | Render function for each item         |
| `renderItem`   | `(item: T, index: number) => ReactNode`        | --                       | Alternative render function           |
| `keyExtractor` | `(item: T, index: number) => string \| number` | **required**             | Extract a unique key for each item    |
| `isFrozen`     | `(item: T, index: number) => boolean`          | --                       | Data-driven frozen predicate          |
| `footer`       | `ReactNode`                                    | --                       | Footer pinned at the bottom           |
| `markers`      | `boolean \| ScrollbackMarkerCallbacks<T>`      | --                       | OSC 133 marker configuration          |
| `width`        | `number`                                       | `process.stdout.columns` | Terminal width in columns             |
| `stdout`       | `{ write(data: string): boolean }`             | `process.stdout`         | Output stream                         |
| `onRecovery`   | `() => void`                                   | --                       | Called on inconsistent state recovery |

## Usage

```tsx
function App() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)

  return (
    <ScrollbackList items={tasks} keyExtractor={(t) => t.id} footer={<Text>Status bar</Text>}>
      {(task) => <TaskItem task={task} />}
    </ScrollbackList>
  )
}

function TaskItem({ task }: { task: Task }) {
  const { freeze } = useScrollbackItem()
  useEffect(() => {
    if (task.done) freeze()
  }, [task.done])
  return <Text>{task.title}</Text>
}
```

## See Also

- [ScrollbackView](./ScrollbackView.md) -- with maxHistory support
- [Static](./Static.md) -- simpler write-once rendering
