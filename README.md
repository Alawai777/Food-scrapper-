# YartedEats 🍽️

A Metro Detroit restaurant discovery web app that aggregates data from **OpenStreetMap**, **Yelp**, and **Google Maps** to help you find your next meal.

## Features

- **Multi-source search** — Query restaurants from OpenStreetMap (free), Yelp Fusion API, or Google Maps Places API
- **Rich filtering** — City/neighborhood, cuisine genre, dining style (dine-in/pickup/food trucks), group size, price range, halal-only, and open-now
- **15 Metro Detroit cities** — Dearborn, Detroit, Ann Arbor, Troy, and more
- **13 cuisine genres** — Middle Eastern, American, Italian, Mexican, Asian, Pizza, Seafood, Mediterranean, Indian, BBQ, Breakfast, Desserts
- **Location-aware sorting** — Sort by distance using your geolocation
- **Dark/light theme** — Toggle between color modes
- **Search history** — Recent searches persisted in a SQLite database

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui, Wouter, TanStack Query
- **Backend**: Express 5, TypeScript, Drizzle ORM, Better-SQLite3
- **Build**: Vite, esbuild
- **APIs**: OpenStreetMap Overpass, Yelp Fusion v3, Google Maps Places (New)

## Getting Started

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

### Production Build

```bash
npm run build
npm start
```

### Type Checking

```bash
npm run check
```

## API Keys

YartedEats works out of the box with **OpenStreetMap** (no API key needed). For richer data (photos, ratings, reviews):

- **Yelp Fusion API** — Get a free key at [yelp.com/developers](https://www.yelp.com/developers/v3/manage_app)
- **Google Maps Places API** — Get a key at [Google Cloud Console](https://console.cloud.google.com/apis/credentials) ($200/mo free credit)

Enter your keys in the ⚙️ Settings panel within the app.

## Project Structure

```
├── client/              # React frontend
│   ├── src/
│   │   ├── pages/       # Page components (Home, NotFound)
│   │   ├── components/  # shadcn/ui components + ThemeProvider
│   │   ├── hooks/       # Custom React hooks
│   │   └── lib/         # Query client, utilities
│   └── index.html
├── server/              # Express backend
│   ├── routes.ts        # API endpoints (search, validate, photo proxy)
│   ├── storage.ts       # Database layer (Drizzle ORM)
│   ├── db.ts            # SQLite connection
│   ├── index.ts         # Server entry point
│   ├── vite.ts          # Vite dev server integration
│   └── static.ts        # Production static file serving
├── shared/              # Shared code between client/server
│   └── schema.ts        # DB schema, city bounding boxes, cuisine/dining configs
└── drizzle.config.ts    # Drizzle Kit configuration
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/search` | Search restaurants (accepts `dataSource`: `osm`, `yelp`, `google`) |
| `POST` | `/api/validate-yelp-key` | Validate a Yelp API key |
| `POST` | `/api/validate-google-key` | Validate a Google Maps API key |
| `GET`  | `/api/google-photo?ref=` | Proxy for Google Places photos (avoids API key exposure) |
| `GET`  | `/api/recent` | Get recent search history |

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 5000) | No |
| `YELP_API_KEY` | Yelp Fusion API key (alternative to in-app setting) | No |
| `GOOGLE_MAPS_API_KEY` | Google Maps API key (alternative to in-app setting) | No |

## License

MIT
