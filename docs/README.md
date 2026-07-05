# AECS docs site

The Starlight (Astro) site for [mvrxapp.github.io/aecs](https://mvrxapp.github.io/aecs/).
Deployed by `.github/workflows/deploy-docs.yml` on every push to `main`.

The spec pages under `src/content/docs/specs/` are generated — run
`node ../scripts/sync-docs-pages.mjs` from the repo root after editing anything in
`../specs/`, don't hand-edit them here.

```bash
pnpm install
pnpm dev      # http://localhost:4321/aecs
pnpm build    # -> ./dist
```
