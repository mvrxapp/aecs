import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://mvrxapp.github.io",
  base: "/aecs",
  integrations: [
    starlight({
      title: "AECS",
      description:
        "AI Email Consumption Specification — an open standard (CC0) for normalizing raw RFC 5322/MIME email into AI-ready JSON.",
      logo: {
        light: "./src/assets/logo-light.svg",
        dark: "./src/assets/logo-dark.svg",
        replacesTitle: false,
      },
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/mvrxapp/aecs" },
      ],
      editLink: {
        baseUrl: "https://github.com/mvrxapp/aecs/edit/main/docs/",
      },
      sidebar: [
        {
          label: "Specification",
          items: [
            {
              label: "AECS-1 (v1.1.1, Final)",
              items: [{ autogenerate: { directory: "specs/aecs-1" } }],
            },
            {
              label: "AECS-SDK-1 (v0.5.0-draft)",
              items: [{ autogenerate: { directory: "specs/aecs-sdk-1" } }],
            },
          ],
        },
        {
          label: "Storage",
          items: [
            { label: "Overview", link: "/storage/" },
            { label: "Cloudflare (D1, R2, Vectorize)", link: "/storage/cloudflare/" },
            { label: "SQLite", link: "/storage/sqlite/" },
            { label: "PostgreSQL", link: "/storage/postgresql/" },
            { label: "MySQL", link: "/storage/mysql/" },
            { label: "MongoDB", link: "/storage/mongodb/" },
            { label: "DynamoDB", link: "/storage/dynamodb/" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "JSON Schema", link: "/reference/schema/" },
            { label: "Conformance suite", link: "/reference/conformance/" },
          ],
        },
      ],
      components: {
        PageTitle: "./src/components/PageTitle.astro",
      },
      customCss: ["./src/styles/custom.css"],
      pagination: false,
      expressiveCode: {
        styleOverrides: {
          borderRadius: "8px",
          codeFontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          frames: {
            editorBackground: "#000000",
            terminalBackground: "#000000",
          },
        },
        themes: ["material-theme-darker", "material-theme-lighter"],
      },
    }),
  ],
});
