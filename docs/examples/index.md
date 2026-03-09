<script setup>
import ShowcaseGallery from '../.vitepress/components/ShowcaseGallery.vue'
</script>

# Examples

Explore all Silvery showcases interactively. Click a demo to load it — keyboard input works inside the terminal.

<ShowcaseGallery />

## Running Examples

Clone the repository and run any example:

```bash
git clone https://github.com/beorn/silvery
cd silvery
bun install
bun run examples/dashboard/app.tsx
```

## Creating Your Own

Start with the simplest example that matches your use case:

| Use Case                | Start With          |
| ----------------------- | ------------------- |
| Single scrollable list  | Task List           |
| Multi-pane layout       | Dashboard           |
| Multiple scroll regions | Kanban              |
| Responsive layout       | Dashboard           |
| Keyboard navigation     | Task List or Kanban |

All examples follow the same patterns:

1. Use `useContentRect()` when you need dimensions
2. Use `overflow="scroll"` + `scrollTo` for scrolling
3. Use `useInput()` for keyboard handling
4. Let flexbox handle proportional sizing
