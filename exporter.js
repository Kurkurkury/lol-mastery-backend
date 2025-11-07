// exporter.js – CSV-Export für example.json
const fs = require('fs');
const path = require('path');
const store = require('./datastore');

function toCSV(rows, headers) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = headers.map(esc).join(';');
  const body = rows.map(r => headers.map(h => esc(r[h])).join(';')).join('\n');
  return head + '\n' + body + '\n';
}

function exportAll() {
  const rows = store.readAll();
  const csv = toCSV(rows, ['account', 'champion', 'mastery', 'updatedAt']);
  const out = path.join(__dirname, 'data', 'export_all.csv');
  fs.writeFileSync(out, csv, 'utf8');
  console.log('Export erstellt:', out);
}

function exportTotals() {
  const totals = store.totalsByChampion();
  const rows = totals.map(t => ({ champion: t.champion, mastery: t.mastery }));
  const csv = toCSV(rows, ['champion', 'mastery']);
  const out = path.join(__dirname, 'data', 'export_totals.csv');
  fs.writeFileSync(out, csv, 'utf8');
  console.log('Export erstellt:', out);
}

const cmd = process.argv[2];
if (cmd === 'totals') exportTotals();
else exportAll();
