# AstroShot

AstroShot is an interactive sky and meteor simulator rendered from an
Earth-based observer's perspective. It combines a real star catalog with
sidereal motion, atmospheric twinkle, an all-sky Milky Way panorama, and
procedural meteors and fireballs.

## Features

- More than 30,000 stars from the HYG Database
- Earth rotation and latitude-aware sky projection
- Drag, wheel, and keyboard navigation
- Procedural meteors with configurable speed, direction, trails, and afterglow
- Weak and strong fireball variants
- A WebGL liquid-glass control panel
- Responsive controls with Chinese and English interface localization

## Getting Started

AstroShot requires Node.js 22.13 or later.

```bash
npm install
npm run dev
```

The development server runs at [http://localhost:3002](http://localhost:3002).

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local Next.js development server |
| `npm run build` | Create the static GitHub Pages export in `out/` |
| `npm start` | Preview the exported site locally |
| `npm test` | Build the site and run the test suite |
| `npm run lint` | Run ESLint |
| `npm run build:xhs` | Build and validate the XHS offline package at `dist/astroshot-xhs.zip` |
| `npm run build:sites` | Build the optional Sites/Cloudflare target |

## GitHub Pages

GitHub Pages is the default production deployment target. Pushing to `main`
triggers `.github/workflows/deploy-pages.yml`, which builds, tests, and deploys
the static export.

For the repository's first deployment, select **GitHub Actions** under
**Settings → Pages → Build and deployment → Source**.

The workflow obtains the Pages URL and base path automatically. To reproduce the
repository subpath locally, run:

```bash
NEXT_PUBLIC_BASE_PATH=/astro-shot \
NEXT_PUBLIC_SITE_URL=https://catsjuice.github.io/astro-shot \
npm test
```

## Controls

- Drag to rotate the view.
- Scroll to change the field of view.
- Use the arrow keys for precise camera movement.
- Open the button in the lower-right corner to adjust simulation settings.
- Press `Escape` or click outside the panel to close it.
- Use the language switch in the panel to change between Chinese and English.

## Data and Acknowledgments

Star data comes from
[HYG Database v4.1](https://github.com/astronexus/HYG-Database), which combines
the Hipparcos, Yale Bright Star, and Gliese catalogs and is distributed under
CC BY-SA 4.0.

The Milky Way background uses the all-sky panorama by ESO / S. Brunier.

The liquid-glass controls are adapted from the
[Liquid DOM MenuDemo](https://github.com/AndrewPrifer/liquid-dom). Thanks to
Andrew Prifer and the Liquid DOM contributors for publishing their work.
