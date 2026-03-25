<script setup>
import { ref, computed } from "vue"

const demos = [
  { id: "dashboard", name: "Dashboard", height: 500 },
  { id: "kanban", name: "Kanban Board", height: 500 },
  { id: "components", name: "Components", height: 500 },
  { id: "dev-tools", name: "Dev Tools", height: 500 },
  { id: "textarea", name: "Text Editor", height: 400 },
]

const active = ref(demos[0])

function select(demo) {
  active.value = demo
}

const iframeSrc = computed(() => `/examples/showcase.html?demo=${active.value.id}`)
</script>

<template>
  <ClientOnly>
    <div class="showcase-gallery">
      <div class="gallery-sidebar">
        <button
          v-for="demo in demos"
          :key="demo.id"
          :class="['gallery-item', { active: active.id === demo.id }]"
          @click="select(demo)"
        >
          {{ demo.name }}
        </button>
      </div>
      <div class="gallery-main">
        <div class="gallery-header">
          <span class="gallery-label">{{ active.name }}</span>
          <span class="gallery-note">Click inside the terminal to interact</span>
        </div>
        <div class="gallery-viewport" :style="{ height: active.height + 'px' }">
          <iframe
            :key="active.id"
            :src="iframeSrc"
            class="gallery-iframe"
            frameborder="0"
            :title="`${active.name} demo`"
            loading="lazy"
            tabindex="0"
          />
        </div>
      </div>
    </div>
  </ClientOnly>
</template>

<style scoped>
.showcase-gallery {
  display: flex;
  gap: 1rem;
  margin: 1.5rem 0;
  max-width: 1100px;
}

.gallery-sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 140px;
  flex-shrink: 0;
}

.gallery-item {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s;
}

.gallery-item:hover {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
}

.gallery-item.active {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  font-weight: 600;
}

.gallery-main {
  flex-grow: 1;
  min-width: 0;
}

.gallery-header {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  border: 1px solid var(--vp-c-divider);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  background: var(--vp-c-bg-soft);
}

.gallery-label {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--vp-c-brand-1);
}

.gallery-note {
  font-size: 0.8rem;
  color: var(--vp-c-text-3);
}

.gallery-viewport {
  position: relative;
  background: #1e1e1e;
  border: 1px solid var(--vp-c-divider);
  border-top: none;
  border-radius: 0 0 8px 8px;
  overflow: hidden;
}

.gallery-iframe {
  width: 100%;
  height: 100%;
  border: none;
  background: #1e1e2e;
}

@media (max-width: 768px) {
  .showcase-gallery {
    flex-direction: column;
  }

  .gallery-sidebar {
    flex-direction: row;
    flex-wrap: wrap;
    min-width: unset;
  }

  .gallery-item {
    padding: 0.4rem 0.6rem;
    font-size: 0.8rem;
  }
}
</style>
