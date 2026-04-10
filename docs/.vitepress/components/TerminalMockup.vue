<script setup>
defineProps({
  title: { type: String, default: "terminal" },
  width: { type: String, default: "100%" },
  side: { type: Boolean, default: false },
})
</script>

<template>
  <div class="terminal-mockup" :style="{ width, display: side ? 'inline-block' : 'block', verticalAlign: 'top' }">
    <div class="terminal-titlebar">
      <span class="terminal-dot red"></span>
      <span class="terminal-dot yellow"></span>
      <span class="terminal-dot green"></span>
      <span class="terminal-title">{{ title }}</span>
    </div>
    <div class="terminal-body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.terminal-mockup {
  border-radius: 8px;
  overflow: hidden;
  margin: 1em 0;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
  border: 1px solid var(--vp-c-border);
  max-width: 100%;
}
.terminal-titlebar {
  background: #2d2d2d;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.terminal-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
}
.terminal-dot.red {
  background: #ff5f56;
}
.terminal-dot.yellow {
  background: #ffbd2e;
}
.terminal-dot.green {
  background: #27c93f;
}
.terminal-title {
  color: #999;
  font-size: 12px;
  margin-left: 8px;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
}
.terminal-body {
  background: #1a1a2e;
  color: #c9d1d9;
  font-family: "SF Mono", "Menlo", "Consolas", "Monaco", monospace;
  font-size: 13px;
  line-height: 1.5;
  padding: 12px 16px;
  white-space: pre;
  overflow-x: auto;
}
.terminal-body :deep(.dim) {
  color: #6e7681;
}
.terminal-body :deep(.green) {
  color: #3fb950;
}
.terminal-body :deep(.red) {
  color: #f85149;
}
.terminal-body :deep(.yellow) {
  color: #d29922;
}
.terminal-body :deep(.blue) {
  color: #58a6ff;
}
.terminal-body :deep(.cyan) {
  color: #39c5cf;
}
.terminal-body :deep(.bold) {
  font-weight: 700;
}
.terminal-body :deep(.underline) {
  text-decoration: underline;
}
.terminal-body :deep(.inverse) {
  background: #c9d1d9;
  color: #1a1a2e;
  padding: 0 2px;
}
.terminal-body :deep(.separator) {
  color: #30363d;
}
.terminal-body :deep(.cursor) {
  background: #c9d1d9;
  color: #1a1a2e;
  animation: blink 1s step-end infinite;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}

/* Scrollback divider */
.terminal-body :deep(.scrollback-line) {
  border-top: 1px dashed #30363d;
  margin: 4px 0;
  display: block;
}
</style>
