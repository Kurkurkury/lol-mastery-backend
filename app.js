// app.js — Express API + Static (Port 3001)
const fs = require("fs");
const path = require("path");
const express = require("express");

const app = express();
const PORT = 3001;
const HOST = "127.0.0.1";

const DATA_DIR = path.join(__dirname, "data");
const EXCLUDE = new Set(["example.json", "template.json", "accounts.json", "status.json"]);

// Hilfsfunktionen
const clean = (s) => String(s || "").replace(/^\uFEFF/, "");
const safeReadJson = (p) => {
  try { return JSON.parse(clean(fs.readFileSync(p, "utf8"))); }
  catch { return null; }
};
const listAccountFiles = () => {
  try {
    return fs.readdirSync(DATA_DIR)
      .filter(f => f.toLowerCase().endsWith(".json") && !EXCLUDE.has(f))
      .map(f => path.join(DATA_DIR, f));
  } catch { return []; }
};

// API: alle Accounts als JSON
app.get("/api/accounts", (_req, res) => {
  const files = listAccountFiles();
  const accounts = files.map(fp => {
    const data = safeReadJson(fp) || {};
    const name = path.basename(fp, ".json");
    const champs = Array.isArray(data.championSet) ? data.championSet.length : 0;
    const points = Number(data.masteryPoints || 0);
    const updated = data.updated || "-";
    return { name, champs, points, updated };
  });
  const totalPoints = accounts.reduce((s, a) => s + a.points, 0);
  const totalChamps = accounts.reduce((s, a) => s + a.champs, 0);
  res.json({
    accounts,
    summary: {
      count: accounts.length,
      totalPoints,
      avgPoints: accounts.length ? Math.round(totalPoints / accounts.length) : 0,
      totalChamps
    }
  });
});

// Static: /public wird als Webseite ausgeliefert
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, HOST, () => {
  console.log(`Server läuft auf http://${HOST}:${PORT}`);
});
