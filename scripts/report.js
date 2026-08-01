#!/usr/bin/env node
// scripts/report.js — render week HTML, optionally upload via xerahscli
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { renderWeekHtml } = require('./render');
const { isoDate, startOfWeek } = require('../db');

function parseArgs(argv) {
  const args = { upload: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--upload') args.upload = true;
    else if (a === '--start' && argv[i + 1]) { args.start = argv[++i]; }
  }
  return args;
}

function pickStart(arg) {
  if (arg) return arg;
  return isoDate(startOfWeek(new Date()));
}

const args = parseArgs(process.argv);
const start = pickStart(args.start);
const html = renderWeekHtml(start);
const outDir = path.join(__dirname, '..', 'reports');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const fileName = `food-week-${start}.html`;
const outPath = path.join(outDir, fileName);
fs.writeFileSync(outPath, html);
console.log(`Wrote ${outPath} (${html.length} bytes)`);

if (args.upload) {
  const cli = '/Users/mike/.local/bin/xerahscli';
  if (!fs.existsSync(cli)) {
    console.error(`xerahscli not found at ${cli}`);
    process.exit(1);
  }
  const cmd = `"${cli}" upload "${outPath}" --as-file --name "${fileName}" --json`;
  console.log(`Running: ${cmd}`);
  let stdout;
  try {
    stdout = execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch (err) {
    console.error('xerahscli failed:');
    if (err.stderr) console.error(err.stderr.toString());
    if (err.stdout) console.error(err.stdout.toString());
    process.exit(1);
  }
  let parsed;
  try { parsed = JSON.parse(stdout); } catch (e) { parsed = { url: stdout }; }
  console.log('URL:', parsed.url || '(none)');
}
