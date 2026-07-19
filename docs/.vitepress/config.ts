import { defineConfig } from "vitepress";
import { mermaidPlugin } from "./mermaid-plugin";

export default defineConfig({
  title: "openclaw-plugins",
  description: "approval-gate and sentinel plugins for OpenClaw",
  base: "/",
  markdown: {
    config: (md) => {
      md.use(mermaidPlugin);
    },
  },
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "approval-gate", link: "/approval-gate/" },
      { text: "sentinel", link: "/sentinel/" },
      {
        text: "GitHub",
        link: "https://github.com/spectra-the-bot/openclaw-plugins",
      },
    ],
    sidebar: {
      "/guide/": [{ text: "Getting Started", link: "/guide/getting-started" }],
      "/approval-gate/": [{ text: "Overview", link: "/approval-gate/" }],
      "/sentinel/": [
        { text: "Overview", link: "/sentinel/" },
        { text: "Quick Start", link: "/sentinel/quick-start" },
        { text: "Callbacks & Hook Sessions", link: "/sentinel/callbacks" },
      ],
    },
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/spectra-the-bot/openclaw-plugins",
      },
    ],
  },
});
