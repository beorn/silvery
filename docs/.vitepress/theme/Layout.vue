<script setup lang="ts">
import DefaultTheme from "vitepress/theme"
import { useData } from "vitepress"
import SilveryTerminal from "./components/SilveryTerminal.vue"

const { Layout } = DefaultTheme
const { frontmatter } = useData()
</script>

<template>
  <Layout>
    <template #home-hero-image>
      <SilveryTerminal />
    </template>
  </Layout>
</template>
