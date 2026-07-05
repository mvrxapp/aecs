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
        src: "./src/assets/logo.svg",
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
              label: "AECS-1 (v1.0.0, Final)",
              items: [{ autogenerate: { directory: "specs/aecs-1" } }],
            },
            {
              label: "AECS-SDK-1 (v0.3.0-draft)",
              items: [{ autogenerate: { directory: "specs/aecs-sdk-1" } }],
            },
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
      customCss: ["./src/styles/custom.css"],
      pagination: false,
    }),
  ],
});
