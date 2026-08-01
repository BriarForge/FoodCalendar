// server.js — Express + static + JSON API
require('dotenv').config(); // FIRST: load .env before any module that reads process.env
const path = require('path');
const express = require('express');
const {
  getWeek,
  upsertSlot,
  deleteSlot,
  listRules,
  createRule,
  deleteRule,
  listUsers,
} = require('./db');

const app = express();
const PORT = Number(process.env.PORT) || 3300;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- API --------------------------------------------------------------------
app.get('/api/users', (req, res) => {
  res.json(listUsers());
});

app.get('/api/week', (req, res) => {
  const start = req.query.start;
  res.json(getWeek(start));
});

app.put('/api/meals/:date/:meal', (req, res) => {
  const { date, meal } = req.params;
  try {
    const result = upsertSlot(date, meal, req.body || {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/meals/:date/:meal', (req, res) => {
  const { date, meal } = req.params;
  deleteSlot(date, meal);
  res.json({ ok: true });
});

app.get('/api/rules', (req, res) => {
  res.json(listRules());
});

app.post('/api/rules', (req, res) => {
  try {
    const id = createRule(req.body || {});
    res.json({ id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/rules/:id', (req, res) => {
  deleteRule(req.params.id);
  res.json({ ok: true });
});

app.get('/api/report', (req, res) => {
  const { renderWeekHtml } = require('./scripts/render');
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(renderWeekHtml(req.query.start));
});

// --- Boot -------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Food Calendar listening on http://localhost:${PORT} (override with PORT=...)`);
});
