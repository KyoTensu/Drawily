# CLAUDE.md

Self-hosted web service to track daily drawings made in Procreate on an iPad Pro.

## Goals

- Send drawings straight from Procreate (share sheet → iOS Shortcut → HTTP upload).
- Show every drawing with a preview.
- Switchable views: grid, timeline (more later).
- Several formats of the same drawing (e.g. `.procreate` + `.png` + `.psd`) are stored and shown as **one drawing**.
- Runs as a single Docker container.

## Stack

| Part | Choice |
|------|--------|
| Front end | Vue 3 + TypeScript, Vite, Vue Router. No UI framework yet. |
| Back end | Node 24 + TypeScript, Hono (`@hono/node-server`) |
| Database | SQLite via built-in `node:sqlite` |
| Images | `sharp` for thumbnails |
| Container | One multi-stage Dockerfile + `docker-compose.yml`, one volume at `/data` |

## Layout (npm workspaces)

```
web/       Vue app (built to web/dist, served by the server)
server/    Hono API + static file serving; app.ts = routes, index.ts = listen
Dockerfile
docker-compose.yml
```

## Commands

- `npm run dev:server` + `npm run dev:web` (two terminals) — Vite on :5173 proxies `/api` to :3000
- `npm run typecheck`, `npm test`, `npm run build`, `npm start` (serves the built app on :3000)
- The server runs its `.ts` files directly with Node's type stripping: no build step, so use only
  erasable TS syntax (no enums/namespaces) and import local files with the `.ts` extension.
  Tests use `node:test` (`*.test.ts` next to the code).

## Key decisions

- **Upload path:** iOS Safari has no Web Share Target, so uploads come from an iOS Shortcut doing
  `POST /api/upload` (multipart, `Authorization: Bearer <APP_TOKEN>`).
- **Access:** private. Everything (UI and API) requires `APP_TOKEN`; browser logs in once and gets a cookie.
- **Grouping:** an upload joins an existing drawing when its filename stem matches and it was uploaded the
  same day (in `TZ`); otherwise it creates a new drawing. The UI can merge/split drawings to fix mistakes.
- **Previews:** PNG/JPEG → resized with sharp. `.procreate` is a zip containing `QuickLook/Thumbnail.png`,
  used as preview without decoding the canvas. PSD/PDF/TIFF/MP4 are stored for download only and borrow the
  preview of another format of the same drawing.
- **Storage:** `/data/drawings.db`, original files under `/data/files/<drawing-id>/`, thumbnails under
  `/data/thumbs/`. Originals are never modified.

## Data model (initial)

- `drawing`: id, title, drawn_on (date), created_at
- `file`: id, drawing_id, format, filename, size, sha256, created_at — sha256 rejects exact duplicate uploads

## Configuration (env)

- `APP_TOKEN` — required, shared secret for UI login and uploads
- `DATA_DIR` — default `/data`
- `PORT` — default `3000`
- `TZ` — timezone used to decide "same day"

## Conventions

- Git workflow is in [CONTRIBUTING.md](CONTRIBUTING.md): branch off `dev`, open PRs into `dev`, never push to
  `dev` or `main` directly. Only a release PR (`dev` → `main`) touches `main`.
- Keep it small: no feature, option or dependency nobody asked for.
- Never commit secrets or `.env`; `.env.example` documents variables.
