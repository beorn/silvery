<script setup>
import { ref, onMounted, onUnmounted } from "vue"

const props = defineProps({
  xtermSrc: { type: String, default: "/examples/xterm.html" },
  height: { type: Number, default: 500 },
})

const iframeRef = ref(null)
const showBuildHint = ref(false)
let timeout = null

function onMessage(event) {
  if (event.data?.type === "silvery-ready") {
    showBuildHint.value = false
    if (timeout) {
      clearTimeout(timeout)
      timeout = null
    }
  }
}

onMounted(() => {
  window.addEventListener("message", onMessage)
  timeout = setTimeout(() => {
    showBuildHint.value = true
  }, 3000)
})

onUnmounted(() => {
  window.removeEventListener("message", onMessage)
  if (timeout) {
    clearTimeout(timeout)
    timeout = null
  }
  // Tell the iframe to clean up its React app and timers, then remove it
  const iframe = iframeRef.value
  if (iframe) {
    try {
      iframe.contentWindow?.postMessage({ type: "silvery-cleanup" }, "*")
    } catch (_) {
      // Cross-origin or already destroyed — ignore
    }
    iframe.removeAttribute("src")
    iframe.remove()
  }
})
</script>

<template>
  <ClientOnly>
    <div class="live-demo">
      <div class="live-demo-header">
        <span class="live-demo-label">Live Demo</span>
        <span class="live-demo-note">Click inside to interact</span>
        <transition name="fade">
          <span v-if="showBuildHint" class="live-demo-build-hint"
            >Blank? Run <code>bun run examples/web/build.ts</code></span
          >
        </transition>
      </div>

      <div class="live-demo-viewport" :style="{ height: height + 'px' }">
        <iframe
          ref="iframeRef"
          :src="xtermSrc"
          class="live-demo-iframe"
          frameborder="0"
          title="Silvery Terminal render target demo"
          loading="lazy"
          tabindex="0"
          @error="() => {}"
        />
      </div>
    </div>
  </ClientOnly>
</template>

<style scoped>
.live-demo {
  margin: 1.5rem 0;
  max-width: 960px;
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

.live-demo-build-hint {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  opacity: 0.6;
}

.live-demo-build-hint code {
  padding: 0.1rem 0.35rem;
  background: rgba(127, 127, 127, 0.15);
  border-radius: 3px;
  font-size: 0.7rem;
}

.live-demo-viewport {
  position: relative;
  background: #0f0f1a;
  border: 1px solid var(--vp-c-divider);
  border-top: none;
  border-radius: 0 0 8px 8px;
  overflow: hidden;
  padding: 12px;
}

.live-demo-iframe {
  width: 100%;
  height: 100%;
  border: none;
  border-radius: 4px;
  background: #0f0f1a;
}

.fade-enter-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from {
  opacity: 0;
}
</style>
