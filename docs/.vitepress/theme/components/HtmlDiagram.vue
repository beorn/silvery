<script setup lang="ts">
import { onMounted, ref } from "vue"

const props = defineProps<{
  html: string
}>()

const hostRef = ref<HTMLElement>()

onMounted(() => {
  if (!hostRef.value) return
  const shadow = hostRef.value.attachShadow({ mode: "open" })
  shadow.innerHTML = props.html
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
