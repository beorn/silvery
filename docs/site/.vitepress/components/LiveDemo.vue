<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  xtermSrc: { type: String, default: '/inkx/examples/xterm.html' },
  height: { type: Number, default: 400 },
})
</script>

<template>
  <ClientOnly>
    <div class="live-demo">
      <div class="live-demo-header">
        <span class="live-demo-label">Terminal</span>
        <span class="live-demo-note">ANSI escape sequences rendered via xterm.js</span>
      </div>

      <div class="live-demo-viewport" :style="{ height: height + 'px' }">
        <iframe
          :src="xtermSrc"
          class="live-demo-iframe"
          frameborder="0"
          title="inkx Terminal render target demo"
          loading="lazy"
          @error="() => {}"
        />
        <div class="live-demo-fallback">
          <p>If the demo is blank, build the examples first:</p>
          <code>bun run examples/web/build.ts</code>
        </div>
      </div>
    </div>
  </ClientOnly>
</template>

<style scoped>
.live-demo {
  margin: 1.5rem 0;
  max-width: 800px;
}

.live-demo-header {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  border: 1px solid var(--vp-c-divider);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  background: var(--vp-c-bg-soft);
}

.live-demo-label {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--vp-c-brand-1);
}

.live-demo-note {
  font-size: 0.8rem;
  color: var(--vp-c-text-3);
}

.live-demo-viewport {
  position: relative;
  background: #1e1e1e;
  border: 1px solid var(--vp-c-divider);
  border-top: none;
  border-radius: 0 0 8px 8px;
  overflow: hidden;
}

.live-demo-iframe {
  width: 100%;
  height: 100%;
  border: none;
  background: #1e1e1e;
}

.live-demo-fallback {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 0.75rem 1rem;
  background: rgba(30, 30, 30, 0.95);
  color: var(--vp-c-text-3);
  font-size: 0.8rem;
  text-align: center;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s;
}

.live-demo-viewport:hover .live-demo-fallback {
  opacity: 1;
}

.live-demo-fallback code {
  display: inline-block;
  margin-top: 0.25rem;
  padding: 0.15rem 0.5rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  font-size: 0.8rem;
}
</style>
