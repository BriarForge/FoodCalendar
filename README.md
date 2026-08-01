# Food Calendar

A weekly family meal planner. Set recurring rules (e.g. "every Friday lunch") and override specific days as needed.

## Setup

```bash
npm install
cp config.env.example .env
# edit .env with your household members
npm start
```

Open `http://localhost:3300` (or whatever `PORT` you set in `.env`).

## Configuration

`FOOD_USERS` is a JSON array. Example:

```
FOOD_USERS='[
  {"id":"alice","display_name":"Alice","color":"#c6f6d5","sort_order":0},
  {"id":"bob","display_name":"Bob","color":"#feebc8","sort_order":1}
]'
```

Each user needs:
- `id` — unique key (no spaces)
- `display_name` — shown in the UI
- `color` — hex colour for the name badge (light tints work best)
- `sort_order` — display order (0, 1, 2, ...)

## Reports

```bash
npm run report -- --start 2026-08-03   # specific week
npm run report -- --upload             # generate + upload via xerahscli
```

## Data

The SQLite database is at `food-calendar.db` (or whatever `FOOD_CALENDAR_DB` points to).
It is never committed to git.
