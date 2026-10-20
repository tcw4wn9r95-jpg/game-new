# Hearth & Crown

A single-player medieval RTS for iPhone (Safari / Home Screen), built per [BUILD_SPEC.md](BUILD_SPEC.md).

```sh
npm install
npm run dev       # local dev server (open on your phone via the LAN URL)
npm test          # vitest
npm run build     # typecheck + production build into dist/
npm run preview   # serve dist/ (service worker active)
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`
(repo Settings → Pages → Source: **GitHub Actions**).
