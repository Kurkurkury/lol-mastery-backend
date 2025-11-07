// datastore.js – Datenspeicher-Schicht für data/example.json
// Validierung, Normalisierung, Auto-Backups + get/remove

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'data', 'example.json');
const BACKUP_DIR = path.join(__dirname, 'data', 'backups');

// ---------- Helpers ----------
function ensureDirs() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) + '-' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function backupFile() {
  try {
    if (!fs.existsSync(FILE)) return;
    const target = path.join(BACKUP_DIR, `example-${timestamp()}.json`);
    fs.copyFileSync(FILE, target);
  } catch { /* ignore */ }
}

function normalizeRecord(r) {
  const account = String(r.account ?? '').trim();
  const champion = String(r.champion ?? '').trim();
  const masteryNum = Number(r.mastery);
  const mastery = Number.isFinite(masteryNum) && masteryNum >= 0 ? Math.floor(masteryNum) : 0;
  if (!account || !champion) throw new Error('Record invalid: "account" und "champion" sind Pflichtfelder.');
  return { account, champion, mastery, updatedAt: new Date().toISOString() };
}

function keyOf(r) {
  return `${r.account}::${r.champion}`.toLowerCase();
}

// ---------- Core ----------
function readAll() {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  ensureDirs();
  backupFile();
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2), 'utf8');
}

function upsert(record) {
  const nextRec = normalizeRecord(record);
  const list = readAll();
  const idx = list.findIndex((r) => keyOf(r) === keyOf(nextRec));
  if (idx >= 0) list[idx] = nextRec; else list.push(nextRec);
  writeAll(list);
  return nextRec;
}

function remove(account, champion) {
  const probe = normalizeRecord({ account, champion, mastery: 0 });
  const list = readAll();
  const next = list.filter((r) => keyOf(r) !== keyOf(probe));
  if (next.length === list.length) return false; // nichts entfernt
  writeAll(next);
  return true;
}

function get(account, champion) {
  const a = String(account).toLowerCase();
  const c = String(champion).toLowerCase();
  return readAll().find(r => r.account.toLowerCase() === a && r.champion.toLowerCase() === c) || null;
}

function totalsByChampion() {
  const agg = {};
  for (const r of readAll()) {
    const m = Number(r.mastery) || 0;
    agg[r.champion] = (agg[r.champion] || 0) + m;
  }
  return Object.entries(agg)
    .map(([champion, mastery]) => ({ champion, mastery }))
    .sort((a, b) => b.mastery - a.mastery);
}

function listByAccount(account) {
  const a = String(account).toLowerCase();
  return readAll().filter((r) => r.account.toLowerCase() === a);
}

module.exports = {
  readAll, writeAll, upsert, remove, get, totalsByChampion, listByAccount
};
