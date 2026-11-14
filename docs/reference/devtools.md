# React DevTools Integration

Silvery supports connecting to the [React DevTools](https://react.dev/learn/react-developer-tools) standalone app for debugging TUI component trees.

## Quick Start

1. Install optional dependencies:

   ```bash
   bun add -d react-devtools-core ws
   ```

2. Launch the DevTools standalone app in one terminal:

   ```bash
   npx react-devtools
   ```

3. Run your Silvery app with the `DEBUG_DEVTOOLS=1` env var:

   ```bash
   DEBUG_DEVTOOLS=1 bun run app.ts
   ```

The DevTools window will show the full React component tree, props, and state for your TUI.

## API

### `connectDevTools(): Promise<boolean>`

Manually connect to React DevTools. Returns `true` on success, `false` on failure.

Safe to call multiple times; subsequent calls are no-ops.

```ts
import { connectDevTools } from "silvery"

const connected = await connectDevTools()
if (connected) {
  console.log("DevTools connected")
}
```

### `isDevToolsConnected(): boolean`

Check whether DevTools are currently connected.

```ts
import { isDevToolsConnected } from "silvery"

if (isDevToolsConnected()) {
  // DevTools are active
}
```

### Auto-connect via environment variable

When `DEBUG_DEVTOOLS=1` (or `DEBUG_DEVTOOLS=true`) is set, Silvery automatically calls `connectDevTools()` during render initialization. No code changes needed.

## How It Works

- `connectDevTools()` lazy-loads `react-devtools-core` so there is zero impact on production bundles
- WebSocket polyfill (`ws`) is loaded automatically for Node.js environments
- Component filters hide Silvery internals (host components and `SilveryApp`) from the DevTools tree, so you see only your application components
- The Silvery reconciler injects renderer info so DevTools can identify it

## Requirements

| Package                | Required | Purpose                          |
| ---------------------- | -------- | -------------------------------- |
| `react-devtools-core`  | Yes      | DevTools client protocol         |
| `ws`                   | Yes      | WebSocket for Node.js            |
| `react-devtools` (CLI) | Yes      | Standalone DevTools electron app |

All are optional peer dependencies. If not installed, `connectDevTools()` returns `false` and logs a helpful warning.

They are declared as optional peers of the `silvery` package: installing Silvery does
not install them, and nothing from them is bundled into the published tarball.

## Upgrading

DevTools is a development-only feature, and its backend is not bundled. An app that
relied on the backend arriving inside Silvery must install the optional peers itself
(`bun add -d react-devtools-core ws`) to keep DevTools working. Without them, ordinary
rendering is unaffected: `connectDevTools()` returns `false` and logs a warning only
when DevTools is explicitly requested.

## Troubleshooting

**DevTools window is blank / not connecting:**

- Ensure the DevTools standalone app is running (`npx react-devtools`) _before_ launching your app
- Check that `ws` is installed (`bun add -d ws`)
- Verify no firewall is blocking localhost:8097 (the default DevTools WebSocket port)

**Component tree is cluttered with internal nodes:**

- Silvery configures component filters automatically. If you still see noise, check that the DevTools "Component Filters" settings include host components (type 7) and `SilveryApp`.

**Performance impact:**

- DevTools adds overhead from serializing the component tree over WebSocket. Use only during development.
