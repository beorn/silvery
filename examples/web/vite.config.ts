import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  build: { target: "esnext" },
  optimizeDeps: {
    esbuildOptions: { target: "esnext" },
    exclude: ["@resvg/resvg-js"],
  },
  resolve: {
    alias: {
      // Stub out node-only deps that silvery imports transitively
      "@resvg/resvg-js": "/dev/null",
    },
  },
})
