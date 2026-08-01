# Food Calendar — Project Agents

## Tech Stack

Node.js + Express + SQLite (better-sqlite3). Single-page UI in `public/index.html`.
Database at `food-calendar.db` (git-ignored). Config via `.env`.

## Architecture

- `server.js` — Express app, static serving, REST API
- `db.js` — SQLite schema, migrations, helpers, rule resolution
- `public/index.html` — SPA frontend (vanilla JS, no build step)
- `scripts/render.js` — shared HTML renderer (used by server API and CLI report)
- `scripts/report.js` — CLI report generator

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `FOOD_USERS` | Yes | JSON array of household members |
| `FOOD_CALENDAR_DB` | No | Path to SQLite file (default: `food-calendar.db`) |
| `PORT` | No | HTTP port (default: `3300`) |

## Key Concepts

- **Rule** — a recurring weekly default (individual or shared)
- **Override** — a one-off slot that takes precedence over rules
- **Shared mode** — one dish, different people eat or not
- **Individual mode** — each person picks their own dish
- **options** — multiple dish alternatives for a single slot (e.g. "Pizza or Tacos")

## Development

```bash
npm install
cp config.env.example .env
# edit .env with your household members
npm start
```

## Deployment

Requires Node.js. Run behind a reverse proxy (nginx) for production.
Use a process supervisor (launchd, systemd, supervisord) to keep it running.
The companion `localhostmgr` project (under the BriarForge organization) manages local services including Food Calendar.
