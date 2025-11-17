// server.js – Mock + Live (Riot) per .env schaltbar
// MOCK_MODE=true  -> nur Mock-Daten
// MOCK_MODE=false -> echte Riot-API

const dotenv = require("dotenv");
dotenv.config({ override: true });

console.log("RIOT_API_KEY aus .env:", process.env.RIOT_API_KEY);

const axios = require("axios"); // aktuell nicht genutzt, kann aber bleiben
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const fetch = require("cross-fetch");

const app = express();

// Wichtig für Hosting: Port vom Hoster verwenden, sonst 4000
const PORT = process.env.PORT || 4000;

const USE_MOCK = process.env.MOCK_MODE === "true";
const RIOT_API_KEY = process.env.RIOT_API_KEY || null;

console.log("MOCK_MODE:", USE_MOCK ? "true (Mock aktiv)" : "false (Riot-Live)");

if (!USE_MOCK) {
  if (!RIOT_API_KEY || !RIOT_API_KEY.startsWith("RGAPI-")) {
    console.error("❌ RIOT_API_KEY in .env fehlt oder ist ungültig.");
    process.exit(1);
  }
  console.log("RIOT_API_KEY geladen:", RIOT_API_KEY.slice(0, 10) + "...");
}

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ---------- MOCK-DATEN LADEN (nur bei MOCK_MODE=true) ----------
let mockMastery = null;
if (USE_MOCK) {
  const mockPath = path.join(__dirname, "data", "mock-mastery.json");
  try {
    const raw = fs.readFileSync(mockPath, "utf8");
    mockMastery = JSON.parse(raw);
    console.log("✔ mock-mastery.json geladen");
  } catch (err) {
    console.error("❌ Konnte mock-mastery.json nicht laden:", err.message);
    process.exit(1);
  }
}

// ---------- Hilfsfunktionen ----------

async function riotGetJson(url) {
  const res = await fetch(url, {
    headers: {
      "X-Riot-Token": RIOT_API_KEY,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Riot API Fehler ${res.status}: ${text}`);
  }

  return res.json();
}

// Riot-ID → Account (PUUID)
async function getPUUIDFromRiotId(name, tagline) {
  const base = "https://europe.api.riotgames.com";
  const url = `${base}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
    name
  )}/${encodeURIComponent(tagline)}`;

  return riotGetJson(url);
}

// Regionale Plattform-URL
function getPlatformBaseUrl(region) {
  return `https://${region}.api.riotgames.com`;
}

// Alle Champion-Masteries eines Summoners holen (für /mastery/overall)
async function getAllMasteriesByPUUID(puuid, region) {
  const base = getPlatformBaseUrl(region);
  const url = `${base}/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(
    puuid
  )}`;
  return riotGetJson(url); // Array von Masteries
}

// ---------- ROUTES ----------

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: USE_MOCK ? "ok (mock)" : "ok (live)",
    time: new Date().toISOString(),
  });
});

// GET /api/account?name=NAME#TAG
// Liefert: gameName, tagLine, puuid
app.get("/api/account", async (req, res) => {
  const full = (req.query.name || "").trim();

  if (!full.includes("#")) {
    return res.status(400).json({ error: "Format: NAME#TAG" });
  }

  const [name, tag] = full.split("#");

  if (USE_MOCK) {
    return res.json({
      gameName: name,
      tagLine: tag,
      puuid: "MOCK-PUUID",
      region: req.query.region || "euw1",
    });
  }

  try {
    const data = await getPUUIDFromRiotId(name, tag);

    res.json({
      gameName: data.gameName,
      tagLine: data.tagLine,
      puuid: data.puuid,
      region: req.query.region || "euw1",
    });
  } catch (err) {
    console.error("[/api/account] Fehler:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /mastery/overall
 * Request: { accounts: [{ name, region }, ...] }
 * Response: { champions: [{ championId, totalPoints }, ...] }
 */
app.post("/mastery/overall", async (req, res) => {
  const { accounts } = req.body || {};

  if (!Array.isArray(accounts) || accounts.length === 0) {
    return res.status(400).json({ error: "accounts fehlt/leer" });
  }

  // MOCK: wir nehmen die Mock-Daten und tun so, als wäre das Gesamt-Overview
  if (USE_MOCK) {
    const totalPoints = (mockMastery.accounts || []).reduce(
      (sum, acc) => sum + (acc.points || 0),
      0
    );

    const championId = mockMastery.championId || 0;

    return res.json({
      champions: [
        {
          championId,
          totalPoints,
        },
      ],
    });
  }

  // LIVE: über alle Accounts alle Champions aufsummieren
  try {
    const totals = new Map(); // championId -> totalPoints

    for (const acc of accounts) {
      const full = (acc.name || "").trim();
      const region = (acc.region || "euw1").toLowerCase();

      if (!full.includes("#")) {
        console.warn(
          `[/mastery/overall] Überspringe Account mit ungültigem Format: "${full}"`
        );
        continue;
      }

      const [nameOnly, tagOnly] = full.split("#");

      try {
        // 1) Riot-ID → PUUID
        const account = await getPUUIDFromRiotId(nameOnly, tagOnly);
        const puuid = account.puuid;

        // 2) Alle Champion-Masteries holen
        const masteries = await getAllMasteriesByPUUID(puuid, region);

        // 3) Punkte pro Champion aufsummieren
        for (const m of masteries) {
          const champId = m.championId;
          const points = m.championPoints || 0;

          const prev = totals.get(champId) || 0;
          totals.set(champId, prev + points);
        }
      } catch (innerErr) {
        console.error(
          `[/mastery/overall] Fehler bei Account ${full} (${region}):`,
          innerErr.message
        );
        // Wir machen mit den anderen Accounts weiter
        continue;
      }
    }

    const champions = Array.from(totals.entries())
      .map(([championId, totalPoints]) => ({
        championId,
        totalPoints,
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints); // absteigend

    return res.json({ champions });
  } catch (err) {
    console.error("[/mastery/overall] Fehler:", err.message);
    return res
      .status(500)
      .json({ error: "Interner Fehler bei /mastery/overall" });
  }
});

// POST /mastery – Aggregiert Punkte über mehrere Accounts für EINEN Champion
app.post("/mastery", async (req, res) => {
  const { championId, championName, accounts } = req.body || {};

  if (!championId) {
    return res.status(400).json({ error: "championId fehlt" });
  }
  if (!Array.isArray(accounts) || accounts.length === 0) {
    return res.status(400).json({ error: "accounts fehlt/leer" });
  }

  // MOCK
  if (USE_MOCK) {
    const results = (mockMastery.accounts || []).map((acc) => ({
      name: acc.name,
      region: acc.region,
      points: acc.points,
      level: acc.level,
    }));

    const totalPoints = results.reduce((sum, r) => sum + (r.points || 0), 0);

    return res.json({
      championId,
      championName: championName || mockMastery.championName,
      totalPoints,
      accounts: results,
    });
  }

  // LIVE
  try {
    const results = [];

    for (const acc of accounts) {
      const full = (acc.name || "").trim();
      const region = (acc.region || "euw1").toLowerCase();

      if (!full.includes("#")) {
        results.push({
          name: full,
          region,
          points: 0,
          level: 0,
          error: "Ungültiges Format (NAME#TAG erwartet)",
        });
        continue;
      }

      const [nameOnly, tagOnly] = full.split("#");

      try {
        // Schritt 1: Riot-ID → PUUID
        const account = await getPUUIDFromRiotId(nameOnly, tagOnly);
        const puuid = account.puuid;

        // Schritt 2: Mastery per PUUID für EINEN Champion
        const base = getPlatformBaseUrl(region);
        const masteryUrl = `${base}/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(
          puuid
        )}/by-champion/${encodeURIComponent(championId)}`;

        let mastery;
        try {
          mastery = await riotGetJson(masteryUrl);
        } catch (innerErr) {
          if (innerErr.message.includes("404")) {
            mastery = null; // keine Mastery -> 0 Punkte
          } else {
            throw innerErr;
          }
        }

        results.push({
          name: `${account.gameName}#${account.tagLine}`,
          region,
          points: mastery ? mastery.championPoints : 0,
          level: mastery ? mastery.championLevel : 0,
        });
      } catch (innerErr) {
        console.error(
          `[/mastery] Fehler bei Account ${full} (${region}):`,
          innerErr.message
        );
        results.push({
          name: full,
          region,
          points: 0,
          level: 0,
          error: innerErr.message,
        });
      }
    }

    const totalPoints = results.reduce((sum, r) => sum + (r.points || 0), 0);

    res.json({
      championId,
      championName: championName || null,
      totalPoints,
      accounts: results,
    });
  } catch (err) {
    console.error("[/mastery] Fehler:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✔ Server läuft auf Port ${PORT}`);
});
