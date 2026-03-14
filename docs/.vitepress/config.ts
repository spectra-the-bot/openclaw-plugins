import { defineConfig } from "vitepress";

export default defineConfig({
  title: "openclaw-plugins",
  description: "native-scheduler and sentinel plugins for OpenClaw",
  base: "/",
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "native-scheduler", link: "/native-scheduler/" },
      { text: "sentinel", link: "/sentinel/" },
      {
        text: "GitHub",
        link: "https://github.com/spectra-the-bot/openclaw-plugins",
      },
    ],
    sidebar: {
      "/guide/": [{ text: "Getting Started", link: "/guide/getting-started" }],
      "/native-scheduler/": [
        { text: "Overview", link: "/native-scheduler/" },
        {
          text: "Script Contract",
          link: "/native-scheduler/script-contract",
        },
        { text: "Tool Actions", link: "/native-scheduler/tool-actions" },
        { text: "Examples", link: "/native-scheduler/examples" },
        {
          text: "Platform Support",
          link: "/native-scheduler/platform-support",
        },
      ],
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
