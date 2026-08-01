// scripts/render.js — shared HTML rendering for /api/report and scripts/report.js
const { getWeek, listUsers, isoDate, startOfWeek, addDays } = require('../db');

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderWeekHtml(startIso) {
  const users = listUsers();
  const week = getWeek(startIso);
  const meals = ['breakfast', 'lunch', 'dinner'];

  // For each day: render three meal sections
  const labelFor = (opts, name) =>
    (opts && opts.length) ? opts.join(' or ') : (name || '');

  const dayBlocks = week.days.map((day, di) => {
    const d = new Date(day.date + 'T00:00:00');
    const dayLabel = `${DAY_NAMES[di]} ${isoDate(d)}`;
    const mealSections = meals.map(meal => {
      const cell = day.cells[meal];
      const items = users.map(u => {
        const entry = (cell.entries || []).find(e => e.user_id === u.id) || { name: '', eating: 0, options: [] };
        const checked = cell.mode === 'shared' ? (entry.eating ? '✓' : '·') : '';
        const txt = labelFor(entry.options, entry.name);
        const display = cell.mode === 'shared' && !entry.eating
          ? '—'
          : (txt || '—');
        return `<li><span class="u" style="background:${u.color}">${escapeHtml(u.display_name)}</span>${checked ? `<span class="chk">${checked}</span>` : ''}<span class="dish">${escapeHtml(display)}</span></li>`;
      }).join('');
      const modeLabel = cell.mode === 'shared' ? 'shared' : cell.mode === 'individual' ? 'individual' : 'empty';
      const sharedLabel = labelFor(cell.options, cell.name);
      return `
        <section class="meal">
          <header>
            <h3>${MEAL_LABELS[meal]} ${cell.mode === 'shared' && sharedLabel ? `· <span style="text-transform:none;letter-spacing:0;color:#1a202c">${escapeHtml(sharedLabel)}</span>` : ''}</h3>
            <span class="mode ${modeLabel}">${modeLabel}</span>
          </header>
          <ul class="entries">${items}</ul>
          ${cell.notes ? `<p class="notes">${escapeHtml(cell.notes)}</p>` : ''}
        </section>`;
    }).join('');

    return `<article class="day"><h2>${dayLabel}</h2>${mealSections}</article>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Food Calendar — week of ${escapeHtml(week.start)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { --bg:#fafaf9; --ink:#1a202c; --muted:#718096; --line:#e2e8f0; }
  * { box-sizing: border-box; }
  body { font: 16px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
         color: var(--ink); background: var(--bg); margin: 0; padding: 24px; }
  h1 { margin: 0 0 4px; font-size: 28px; }
  .meta { color: var(--muted); margin-bottom: 24px; }
  .grid { display: grid; gap: 16px; }
  @media (min-width: 800px) { .grid { grid-template-columns: repeat(2, 1fr); } }
  @media (min-width: 1200px) { .grid { grid-template-columns: repeat(3, 1fr); } }
  article.day { background: white; border: 1px solid var(--line); border-radius: 12px;
                padding: 16px 18px; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
  article.day h2 { margin: 0 0 12px; font-size: 20px; color: var(--ink);
                   border-bottom: 1px solid var(--line); padding-bottom: 8px; }
  section.meal { margin: 12px 0 16px; }
  section.meal header { display: flex; align-items: center; justify-content: space-between;
                        margin-bottom: 6px; }
  section.meal h3 { margin: 0; font-size: 14px; text-transform: uppercase;
                    letter-spacing: .04em; color: var(--muted); }
  .mode { font-size: 11px; padding: 2px 8px; border-radius: 999px;
          background: var(--line); color: var(--ink); }
  .mode.shared { background: #e6fffa; color: #234e52; }
  .mode.individual { background: #ebf4ff; color: #2a4365; }
  ul.entries { list-style: none; margin: 0; padding: 0; }
  ul.entries li { display: flex; align-items: center; gap: 8px;
                  padding: 4px 0; border-bottom: 1px dashed var(--line); }
  ul.entries li:last-child { border-bottom: 0; }
  .u { font-size: 11px; padding: 2px 8px; border-radius: 999px;
       color: #1a202c; min-width: 56px; text-align: center; }
  .chk { font-weight: bold; color: #38a169; }
  .dish { flex: 1; }
  .notes { font-size: 13px; color: var(--muted); margin: 4px 0 0; }
  .chip { font-size: 11px; padding: 1px 6px; border-radius: 6px; background: var(--line); }
</style>
</head>
<body>
<h1>Food Calendar</h1>
<p class="meta">Week of ${escapeHtml(week.start)} · ${week.days.length} days</p>
<div class="grid">${dayBlocks}</div>
</body>
</html>`;
}

module.exports = { renderWeekHtml };
