import DefaultTheme from "vitepress/theme"
import Layout from "./Layout.vue"
import "vitepress-enrich/css/tooltip.css"
import "vitepress-enrich/css/glossary-links.css"

export default {
  extends: DefaultTheme,
  Layout,
}
