<script setup lang="ts">
import { onMounted, ref } from "vue"

const props = defineProps<{
  html: string
}>()

const hostRef = ref<HTMLElement>()

onMounted(() => {
  if (!hostRef.value) return
  const shadow = hostRef.value.attachShadow({ mode: "open" })
  // Inject a light background wrapper so diagrams are visible on both light and dark pages
  shadow.innerHTML = `<style>
    .diagram-card {
      background: #f8f9fb;
      border-radius: 12px;
      padding: 8px;
      border: 1px solid rgba(0, 0, 0, 0.06);
    }
    @media (prefers-color-scheme: dark) {
      .diagram-card {
        background: #252535;
        border-color: rgba(255, 255, 255, 0.08);
      }
    }
  </style><div class="diagram-card">${props.html}</div>`
})
</script>

<template>
  <div ref="hostRef" class="html-diagram" />
</template>

<style>
.html-diagram {
  margin: 16px 0;
  border-radius: 12px;
  overflow: hidden;
}
</style>
