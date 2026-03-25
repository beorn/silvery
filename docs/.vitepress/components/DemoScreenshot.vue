<script setup>
const props = defineProps({
  demo: { type: String, required: true },
  name: { type: String, default: "" },
  height: { type: Number, default: 500 },
})

const label = props.name || props.demo
const src = `/screenshots/${props.demo}.png`
</script>

<template>
  <div class="demo-screenshot">
    <div class="demo-screenshot-header">
      <span class="demo-screenshot-label">{{ label }}</span>
      <span class="demo-screenshot-hint"> Run locally: <code>bun run docs:dev</code> </span>
    </div>

    <div class="demo-screenshot-viewport" :style="{ height: height + 'px' }">
      <img :src="src" :alt="`Screenshot of ${label} demo`" class="demo-screenshot-img" />
    </div>
  </div>
</template>

<style scoped>
.demo-screenshot {
  margin: 1.5rem 0;
  max-width: 960px;
}

.demo-screenshot-header {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  border: 1px solid var(--vp-c-divider);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  background: var(--vp-c-bg-soft);
}

.demo-screenshot-label {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--vp-c-brand-1);
}

.demo-screenshot-hint {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  opacity: 0.7;
}

.demo-screenshot-hint code {
  padding: 0.1rem 0.35rem;
  background: rgba(127, 127, 127, 0.15);
  border-radius: 3px;
  font-size: 0.7rem;
}

.demo-screenshot-viewport {
  position: relative;
  background: #1e1e2e;
  border: 1px solid var(--vp-c-divider);
  border-radius: 0 0 8px 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.demo-screenshot-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
</style>
