# Recipe Keeper

A clean, mobile-friendly recipe-tracking Progressive Web App hosted on GitHub Pages, with Supabase providing authentication, synchronized data, and private image storage.

## Architecture

- Static HTML, CSS, and JavaScript—no framework, package manager, or build step
- GitHub Pages hosts the frontend from the `main` branch
- Supabase Auth provides email/password accounts
- Supabase Postgres stores recipes, ingredients, steps, timers, costs, and ownership
- Supabase Storage keeps recipe images in private per-user folders
- Row Level Security ensures signed-in users can access only their own content
- A service worker caches the app shell for graceful offline loading
- Hash-based navigation and relative asset paths work at `/recipe-tracker/`

The Supabase URL and publishable/anonymous key used by a browser are intentionally public credentials. Never put the service-role key, database password, or an access token in this repository.

## Current setup status

The complete frontend and database schema are included. Before login and synchronization can work, follow [SETUP.md](SETUP.md) to create and connect the Supabase project and enable GitHub Pages.

## Main files

| File | Purpose |
|---|---|
| `index.html` | App shell and metadata |
| `styles.css` | Responsive light/dark interface |
| `js/app.js` | Screens, forms, validation, CRUD, filtering, backups, and cooking mode |
| `js/database.js` | Supabase authentication, database, and image operations |
| `js/timers.js` | Multiple persistent cooking timers |
| `js/config.js` | Frontend-safe Supabase connection values |
| `supabase/schema.sql` | Tables, indexes, RLS policies, storage policies, and atomic save function |
| `manifest.webmanifest` / `sw.js` | PWA installation and offline app shell |

## Features

- Search, category and favorite filters, sorting, and random meal selection
- Add, edit, duplicate, and safely delete recipes
- Reorderable ingredients and cooking steps with separate notes
- Temporary serving adjustment with practical fraction display
- Checkable ingredients and directions with a one-tap reset
- Multiple step timers with start, pause, resume, reset, sound, and persistent countdowns
- Client-side image compression and private Supabase Storage uploads
- Optional cost tracking with guarded cost-per-serving calculation
- JSON backup export and validated import
- Responsive phone/desktop design, light/dark mode, and PWA support

## Important

This project uses only GitHub Pages and Supabase. It does not use Vercel, Netlify, Cloudflare, Firebase, or another hosting/backend provider.
