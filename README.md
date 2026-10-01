# Flesh and Blood

A frontend-only Silver Age game prototype. It loads the product catalog from Card Vault, requests deck details when a hero is selected, and uses the checked-in deck and image backups if Card Vault is unavailable.

## Run locally

Requires Node.js 18 or newer.

```powershell
npm install
npm run dev
```

Open http://localhost:3000.

## Refresh saved data

```powershell
npm run backup:decks
```

This refreshes `ui/data/decks/` and downloads the associated card images into `ui/assets/cards/`. Commit these files to update the offline fallback and published site.

## GitHub Pages

The `Deploy to GitHub Pages` workflow builds the static site from `ui/` and publishes the result from `dist/` whenever `main` is updated. In the repository settings, set **Pages > Build and deployment > Source** to **GitHub Actions**. The build output is local-only and is not committed.

To build it locally, run `npm run build:pages`.