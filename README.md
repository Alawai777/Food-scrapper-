# YartedEats 🍽️

A Metro Detroit restaurant discovery web app that aggregates data from **OpenStreetMap**, **Yelp**, and **Google Maps** to help you find your next meal.

## 🌐 Use It Now — No Install Required

**Open the app in any browser on iOS, Android, or desktop:**

👉 **https://alawai777.github.io/Food-scrapper-/**

### Add to Home Screen (iOS / Android)

YartedEats is a **Progressive Web App (PWA)** — you can install it like a native app:

- **iPhone / iPad**: Open the link in Safari → tap the **Share** button → **Add to Home Screen**
- **Android**: Open the link in Chrome → tap the **⋮ menu** → **Add to Home Screen** (or accept the install prompt)
- **Desktop**: Click the install icon in the browser address bar

Once added, it launches full-screen like a native app — no App Store needed.

## Features

- **Multi-source search** — Query restaurants from OpenStreetMap (free), Yelp Fusion API, or Google Maps Places API
- **Rich filtering** — City/neighborhood, cuisine genre, dining style (dine-in/pickup/food trucks), group size, price range, halal-only, and open-now
- **15 Metro Detroit cities** — Dearborn, Detroit, Ann Arbor, Troy, and more
- **13 cuisine genres** — Middle Eastern, American, Italian, Mexican, Asian, Pizza, Seafood, Mediterranean, Indian, BBQ, Breakfast, Desserts
- **Location-aware sorting** — Sort by distance using your geolocation
- **Dark/light theme** — Toggle between color modes
- **Works offline** — Basic offline shell via service worker
- **Runs anywhere** — Static site, no backend server needed

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui, Wouter, TanStack Query
- **APIs**: OpenStreetMap Overpass (free, no key), Yelp Fusion v3, Google Maps Places (New)
- **Build**: Vite
- **Hosting**: GitHub Pages (auto-deployed on push to `main`)
- **PWA**: Service worker + web app manifest for iOS/Android installability

## Getting Started (Development)

### Prerequisites

- Node.js 20+
- npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The app starts at `http://localhost:5000`.

### Production Build (Static Site)

```bash
npx vite build --config vite.config.ts
```

Output goes to `dist/public/` — deploy anywhere (GitHub Pages, Netlify, Vercel, etc.).

### Type Checking

```bash
npm run check
```

## API Keys

YartedEats works out of the box with **OpenStreetMap** (no API key needed). For richer data (photos, ratings, reviews):

- **Yelp Fusion API** — Get a free key at [yelp.com/developers](https://www.yelp.com/developers/v3/manage_app)
- **Google Maps Places API** — Get a key at [Google Cloud Console](https://console.cloud.google.com/apis/credentials) ($200/mo free credit)

Enter your keys in the ⚙️ Settings panel within the app. The Yelp key is saved in browser storage so you don't need to re-enter it every visit.

If you're running the Express server, you can also set `YELP_API_KEY` as an environment variable and Yelp searches will use it automatically in the background.

> **🔒 API Key Security:** Since this is a client-side app, API keys are used directly in the browser. For **Google Maps**, [restrict your key](https://cloud.google.com/docs/authentication/api-keys#securing_an_api_key) to your domain in Google Cloud Console. **Yelp** requests go through a CORS proxy (corsproxy.io) since Yelp's API doesn't support browser requests — avoid using production keys for Yelp in the web version.

## How It Works

The app runs **entirely in your browser** — no backend server required:

1. **OpenStreetMap** searches go directly to the [Overpass API](https://overpass-api.de/) (free, full CORS support)
2. **Google Maps** searches go directly to the [Places API](https://developers.google.com/maps/documentation/places/web-service) (supports CORS with your API key)
3. **Yelp** searches use a CORS proxy since Yelp's API doesn't support browser requests
4. Search history is saved in **localStorage** (stays on your device)

## Deployment

The app automatically deploys to GitHub Pages when you push to `main` via the `.github/workflows/deploy.yml` workflow.

To deploy manually or to another host, just build and upload the `dist/public/` folder.

## Project Structure

```
├── client/              # React frontend (this IS the app)
│   ├── src/
│   │   ├── pages/       # Page components (Home, NotFound)
│   │   ├── components/  # shadcn/ui components + ThemeProvider
│   │   ├── hooks/       # Custom React hooks
│   │   └── lib/         # API client, query client, utilities
│   ├── public/          # Static assets (PWA manifest, icons, service worker)
│   └── index.html
├── server/              # Express backend (optional, for local dev)
├── shared/              # Shared code between client/server
│   └── schema.ts        # City bounding boxes, cuisine/dining configs
├── .github/workflows/   # GitHub Actions for auto-deploy
└── vite.config.ts       # Vite build configuration
```

## License

MIT
