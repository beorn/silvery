---
layout: page
title: Theme Explorer
---

<script setup>
import ThemeExplorer from './.vitepress/components/ThemeExplorer.vue'
</script>

# Theme Explorer

Browse 84 color schemes, preview how they look, or generate a custom theme from any color. Every theme on this page is a [Sterling](/guide/sterling) Theme — silvery's canonical design system as of 0.20.0.

::: tip New in 0.20.0 — Sterling is THE Theme
silvery 0.20.0 ships [Sterling](/guide/sterling) as the one-and-only Theme shape. Nested role objects (`theme.accent.bg`) plus flat hyphen-keys (`theme["bg-accent"]`) on the same frozen object. Full migration map for the legacy `$tokens` is in the [Sterling primer](/guide/sterling#migrating-from-pre-0-20-0).
:::

<ThemeExplorer />
