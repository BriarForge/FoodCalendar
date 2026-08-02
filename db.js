// db.js — schema, migration, seed, query helpers
// Users are driven entirely by the FOOD_USERS env var (JSON array).
// No personal data is hardcoded here.
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.FOOD_CALENDAR_DB ||
  path.join(__dirname, 'food-calendar.db');

// Ensure parent directory exists
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');

// --- Schema -----------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meal_slots (
  date TEXT NOT NULL,
  meal TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'individual',
  name TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  recipe_url TEXT DEFAULT '',
  source TEXT DEFAULT 'ui',
  cost REAL,
  PRIMARY KEY (date, meal)
);

CREATE TABLE IF NOT EXISTS meal_entries (
  date TEXT NOT NULL,
  meal TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT DEFAULT '',
  eating INTEGER NOT NULL DEFAULT 1,
  cost REAL,
  PRIMARY KEY (date, meal, user_id),
  FOREIGN KEY (date, meal) REFERENCES meal_slots(date, meal) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL,
  user_id TEXT,
  weekday INTEGER NOT NULL,
  meal TEXT NOT NULL,
  name TEXT NOT NULL,
  notes TEXT DEFAULT '',
  recipe_url TEXT DEFAULT '',
  cost REAL
);

CREATE TABLE IF NOT EXISTS rule_eaters (
  rule_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (rule_id, user_id),
  FOREIGN KEY (rule_id) REFERENCES rules(id) ON DELETE CASCADE
);
`);

// --- Migrations: add missing columns ----------------------------------------
function ensureColumn(table, col, decl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
  if (!cols.includes(col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
    return true;
  }
  return false;
}
ensureColumn('meal_slots',   'options_json', 'TEXT');
ensureColumn('meal_entries', 'options_json', 'TEXT');
ensureColumn('rules',        'options_json', 'TEXT');
ensureColumn('meal_slots',   'cost',         'REAL');
ensureColumn('rules',        'cost',         'REAL');
ensureColumn('meal_entries', 'cost',         'REAL');

// Backfill: any row with a non-empty name and NULL options_json gets JSON array
function backfill(table) {
  const rows = db.prepare(`SELECT rowid AS rid, name, options_json FROM ${table}`).all();
  const upd = db.prepare(`UPDATE ${table} SET options_json=? WHERE rowid=?`);
  let n = 0;
  for (const r of rows) {
    if ((r.options_json == null || r.options_json === '') && r.name) {
      upd.run(JSON.stringify([r.name]), r.rid);
      n++;
    }
  }
  return n;
}
const backfilled = {
  rules: backfill('rules'),
  meal_entries: backfill('meal_entries'),
  meal_slots: backfill('meal_slots'),
};

// --- Seed users from FOOD_USERS env var --------------------------------------
// FOOD_USERS is a JSON array: [{ id, display_name, color, sort_order }, ...]
// Example: FOOD_USERS='[{\"id\":\"alice\",\"display_name\":\"Alice\",\"color\":\"#c6f6d5\",\"sort_order\":0}]'
let SEED_USERS = [];
try {
  if (process.env.FOOD_USERS) {
    SEED_USERS = JSON.parse(process.env.FOOD_USERS);
  }
} catch (err) {
  console.error('[db] Warning: FOOD_USERS env var is not valid JSON — no users seeded. See config.env.example.');
}

const seedUser = db.prepare(
  `INSERT OR IGNORE INTO users (id, display_name, color, sort_order)
   VALUES (@id, @display_name, @color, @sort_order)`
);
for (const u of SEED_USERS) seedUser.run(u);

// --- Helpers ----------------------------------------------------------------
function parseOptions(json, name) {
  if (json) {
    try {
      const arr = JSON.parse(json);
      if (Array.isArray(arr)) return arr.filter(s => s && String(s).trim() !== '');
    } catch (_) {}
  }
  if (name && name.trim() !== '') return [name];
  return [];
}

// --- Date helpers ------------------------------------------------------------
function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function startOfWeek(d) {
  // Mon = 0..Sun = 6
  const day = (d.getDay() + 6) % 7;
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() - day);
  return copy;
}
function addDays(d, n) {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() + n);
  return copy;
}
function isValidIsoDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// --- Resolve a (date, meal) cell to its full view ----------------------------
// Returns { mode, name, notes, recipe_url, entries: [{user_id, name, eating, options}], options, source, cost }
function resolveSlot(date, meal) {
  const slot = db.prepare(
    `SELECT mode, name, notes, recipe_url, options_json, cost FROM meal_slots WHERE date=? AND meal=?`
  ).get(date, meal);
  if (slot) {
    const rawEntries = db.prepare(
      `SELECT user_id, name, eating, options_json, cost FROM meal_entries
       WHERE date=? AND meal=? ORDER BY user_id`
    ).all(date, meal);
    const slotOptions = parseOptions(slot.options_json, slot.name);
    let entries = rawEntries.map(e => {
      const options = parseOptions(e.options_json, e.name);
      return { user_id: e.user_id, name: options[0] || e.name || '', eating: e.eating ? 1 : 0, options, cost: e.cost != null ? e.cost : null };
    });
    if (slot.mode === 'shared') {
      entries = entries.map(e => e.eating
        ? { ...e, name: slotOptions[0] || e.name || '', options: slotOptions }
        : { ...e, name: '', options: [] });
    }
    const totalCost = entries.reduce((sum, e) => sum + (e.cost != null ? e.cost : 0), 0);
    return {
      mode: slot.mode,
      name: slotOptions[0] || slot.name || '',
      notes: slot.notes || '',
      recipe_url: slot.recipe_url || '',
      options: slotOptions,
      entries,
      source: 'override',
      cost: totalCost > 0 ? totalCost : null,
    };
  }
  // No override — apply rules
  const dow = (new Date(date + 'T00:00:00').getDay() + 6) % 7;
  const userEntries = db.prepare(
    `SELECT u.id AS user_id, u.display_name, u.color, r.name, r.notes, r.options_json, r.cost
     FROM rules r
     JOIN users u ON u.id = r.user_id
     WHERE r.mode='individual' AND r.user_id=u.id AND r.weekday=? AND r.meal=?`
  ).all(dow, meal);
  const sharedRules = db.prepare(
    `SELECT id, name, notes, options_json, cost FROM rules
     WHERE mode='shared' AND weekday=? AND meal=?`
  ).all(dow, meal);
  const sharedRule = sharedRules[0] || null;
  const sharedOptions = sharedRule ? parseOptions(sharedRule.options_json, sharedRule.name) : [];
  const sharedEaters = sharedRule ?
    db.prepare(
      `SELECT user_id FROM rule_eaters WHERE rule_id=?`
    ).all(sharedRule.id).map(r => r.user_id) : [];

  const hasSharedCost = sharedRule && sharedRule.cost != null;
  const costEach = hasSharedCost ? sharedRule.cost / sharedEaters.length : null;
  entries = SEED_USERS.map(u => {
    const ind = userEntries.find(r => r.user_id === u.id);
    if (ind) {
      const options = parseOptions(ind.options_json, ind.name);
      return { user_id: u.id, name: options[0] || ind.name || '', eating: 1, options, cost: ind.cost != null ? ind.cost : null };
    }
    if (sharedRule) {
      const eating = sharedEaters.includes(u.id) ? 1 : 0;
      return { user_id: u.id, name: sharedOptions[0] || sharedRule.name || '', eating, options: eating ? sharedOptions : [], cost: eating && costEach !== null ? costEach : null };
    }
    return { user_id: u.id, name: '', eating: 0, options: [], cost: null };
  });

  let mode = 'empty';
  if (userEntries.length || sharedRule) {
    mode = sharedRule ? 'shared' : 'individual';
  }
  const totalCost = entries.reduce((sum, e) => sum + (e.cost != null ? e.cost : 0), 0);
  return {
    mode,
    name: sharedOptions[0] || '',
    notes: sharedRule ? sharedRule.notes : '',
    recipe_url: '',
    options: sharedOptions,
    entries,
    source: sharedRule || userEntries.length ? 'rule' : 'empty',
    cost: totalCost > 0 ? totalCost : null,
  };
}

function getWeek(startIso) {
  let start;
  if (startIso && isValidIsoDate(startIso)) {
    start = startOfWeek(new Date(startIso + 'T00:00:00'));
  } else {
    start = startOfWeek(new Date());
  }
  const days = [];
  const meals = ['breakfast', 'lunch', 'dinner'];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const iso = isoDate(d);
    days.push({ date: iso, cells: {} });
  }
  for (const day of days) {
    for (const meal of meals) {
      day.cells[meal] = resolveSlot(day.date, meal);
    }
  }
  return { start: isoDate(start), days };
}

function normalizeOptions(input, fallbackName) {
  let arr = Array.isArray(input) ? input : null;
  if (!arr && typeof input === 'string') {
    arr = input.split(/\s+or\s+|\s*\|\s*/i).map(s => s.trim()).filter(Boolean);
  }
  if (!arr || !arr.length) arr = parseOptions(null, fallbackName);
  return [...new Set(arr.map(s => String(s).trim()).filter(Boolean))];
}

// --- Mutations ---------------------------------------------------------------
function upsertSlot(date, meal, body) {
  const mode = body.mode === 'shared' ? 'shared' : 'individual';
  const notes = body.notes || '';
  const recipe_url = body.recipe_url || '';
  const source = body.source || 'ui';

  const slotOptions = normalizeOptions(body.options, body.name || '');
  const slotName = slotOptions[0] || body.name || '';
  const entries = Array.isArray(body.entries) ? body.entries : [];

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO meal_slots (date, meal, mode, name, notes, recipe_url, source, options_json, cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date, meal) DO UPDATE SET
        mode=excluded.mode,
        name=excluded.name,
        notes=excluded.notes,
        recipe_url=excluded.recipe_url,
        source=excluded.source,
        options_json=excluded.options_json,
        cost=excluded.cost
    `).run(date, meal, mode, slotName, notes, recipe_url, source, JSON.stringify(slotOptions), null);

    db.prepare(`DELETE FROM meal_entries WHERE date=? AND meal=?`).run(date, meal);

    const ins = db.prepare(`
      INSERT INTO meal_entries (date, meal, user_id, name, eating, options_json, cost) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const e of entries) {
      if (!e || !e.user_id) continue;
      const eOptions = normalizeOptions(e.options, e.name || '');
      const eName = eOptions[0] || e.name || '';
      const eCost = e.cost != null && e.cost !== '' ? parseFloat(e.cost) : null;
      ins.run(date, meal, e.user_id, eName, e.eating ? 1 : 0, JSON.stringify(eOptions), eCost);
    }
  });
  tx();
  return resolveSlot(date, meal);
}

function deleteSlot(date, meal) {
  db.prepare(`DELETE FROM meal_slots WHERE date=? AND meal=?`).run(date, meal);
}

function listRules() {
  const rules = db.prepare(`SELECT * FROM rules ORDER BY weekday, meal, id`).all();
  const eaters = db.prepare(`SELECT * FROM rule_eaters`).all();
  return rules.map(r => {
    const options = parseOptions(r.options_json, r.name);
    return {
      ...r,
      name: options[0] || r.name || '',
      options,
      eaters: eaters.filter(e => e.rule_id === r.id).map(e => e.user_id),
    };
  });
}

function createRule(body) {
  const mode = body.mode === 'shared' ? 'shared' : 'individual';
  const weekday = Number(body.weekday);
  const meal = body.meal;
  const notes = body.notes || '';
  const recipe_url = body.recipe_url || '';
  const user_id = mode === 'individual' ? (body.user_id || null) : null;
  const eaters = Array.isArray(body.eaters) ? body.eaters : [];
  const options = normalizeOptions(body.options, body.name || '');
  const name = options[0] || body.name || '';
  const cost = body.cost != null && body.cost !== '' ? parseFloat(body.cost) : null;
  const tx = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO rules (mode, user_id, weekday, meal, name, notes, recipe_url, options_json, cost)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(mode, user_id, weekday, meal, name, notes, recipe_url, JSON.stringify(options), cost);
    const ruleId = info.lastInsertRowid;
    if (mode === 'shared') {
      const ins = db.prepare(
        `INSERT INTO rule_eaters (rule_id, user_id) VALUES (?, ?)`
      );
      for (const u of eaters) ins.run(ruleId, u);
    }
    return ruleId;
  });
  return tx();
}

function deleteRule(id) {
  db.prepare(`DELETE FROM rules WHERE id=?`).run(Number(id));
}

function updateRule(id, body) {
  const n = Number(id);
  const existing = db.prepare(`SELECT * FROM rules WHERE id=?`).get(n);
  if (!existing) throw new Error(`Rule ${id} not found`);

  const mode = body.mode !== undefined ? (body.mode === 'shared' ? 'shared' : 'individual') : existing.mode;
  const hasOptions = body.options !== undefined || body.name !== undefined;
  const options = hasOptions ? normalizeOptions(body.options, body.name !== undefined ? body.name : existing.name) : parseOptions(existing.options_json, existing.name);
  const name = options[0] || existing.name;
  const notes = body.notes !== undefined ? body.notes : existing.notes;
  const recipe_url = body.recipe_url !== undefined ? body.recipe_url : existing.recipe_url;
  const cost = body.cost !== undefined ? (body.cost !== '' && body.cost != null ? parseFloat(body.cost) : null) : existing.cost;
  const eaters = Array.isArray(body.eaters) ? body.eaters
    : (body.eaters !== undefined ? [] : db.prepare(`SELECT user_id FROM rule_eaters WHERE rule_id=?`).all(n).map(r => r.user_id));

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE rules SET
        mode=?, name=?, notes=?, recipe_url=?, options_json=?, cost=?
      WHERE id=?
    `).run(mode, name, notes, recipe_url, JSON.stringify(options), cost, n);

    db.prepare(`DELETE FROM rule_eaters WHERE rule_id=?`).run(n);
    if (mode === 'shared') {
      const ins = db.prepare(`INSERT INTO rule_eaters (rule_id, user_id) VALUES (?, ?)`);
      for (const u of eaters) ins.run(n, u);
    }
  });
  tx();
  return db.prepare(`SELECT * FROM rules WHERE id=?`).get(n);
}

function listUsers() {
  return db.prepare(`SELECT * FROM users ORDER BY sort_order`).all();
}

module.exports = {
  db,
  DB_PATH,
  isoDate,
  startOfWeek,
  addDays,
  resolveSlot,
  getWeek,
  upsertSlot,
  deleteSlot,
  listRules,
  createRule,
  deleteRule,
  updateRule,
  listUsers,
  normalizeOptions,
  parseOptions,
  backfilled,
  SEED_USERS,
};
