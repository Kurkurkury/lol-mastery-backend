// server.js – Mock + Live (Riot) per .env schaltbar
// MOCK_MODE=true  -> nur Mock-Daten für Mastery
// MOCK_MODE=false -> echte Riot-API

const dotenv = require("dotenv");
dotenv.config({ override: true });

console.log("RIOT_API_KEY aus .env:", process.env.RIOT_API_KEY);

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

// *** Faktor: Stunden pro Account-Level (Spielzeit-Schätzung) ***
const HOURS_PER_LEVEL = 7.5;

console.log("MOCK_MODE:", USE_MOCK ? "true (Mock aktiv)" : "false (Riot-Live)");

if (!USE_MOCK) {
  if (!RIOT_API_KEY) {
    console.warn(
      "⚠ WARNUNG: MOCK_MODE=false, aber kein RIOT_API_KEY in .env gesetzt."
    );
  } else {
    console.log("✔ Riot-Live-Modus mit API-Key aktiv");
  }
}

// ---------------------------------------------------------
// Mock-Daten, falls MOCK_MODE=true (nur für Mastery)
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// Hilfsfunktionen – Riot API Queue + Parsing
// ---------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Promise-Queue für Riot-Requests (werden sequentiell abgearbeitet)
let riotQueue = Promise.resolve();

// Mindestabstand zwischen zwei Riot-Requests (in ms).
// 2500 ms ≈ 1 Request alle 2.5 Sekunden (~48 Requests pro 2 Minuten)
const RIOT_MIN_DELAY_MS = 2500;

async function riotGetJson(url) {
  if (!RIOT_API_KEY) {
    throw new Error("Kein RIOT_API_KEY gesetzt");
  }

  const runInQueue = async () => {
    let attempt = 1;

    while (true) {
      const start = Date.now();

      const res = await fetch(url, {
        headers: {
          "X-Riot-Token": RIOT_API_KEY,
        },
      });

      const elapsed = Date.now() - start;
      if (elapsed < RIOT_MIN_DELAY_MS) {
        await sleep(RIOT_MIN_DELAY_MS - elapsed);
      }

      // Rate-Limit: 429 Too Many Requests
      if (res.status === 429 && attempt <= 3) {
        const retryAfterHeader = res.headers.get("Retry-After");
        let retryMs = 1500;
        if (retryAfterHeader) {
          const parsed = parseFloat(retryAfterHeader);
          if (!Number.isNaN(parsed) && parsed > 0) {
            retryMs = parsed * 1000;
          }
        }
        console.warn(
          `[riotGetJson] 429 Rate Limit für URL: ${url} – Retry in ${retryMs}ms (Versuch ${attempt})`
        );
        attempt += 1;
        await sleep(retryMs);
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Riot API Fehler ${res.status}: ${text}`);
      }

      return res.json();
    }
  };

  const next = riotQueue.then(runInQueue);
  riotQueue = next.catch(() => {});
  return next;
}

// Riot-ID "Name#TAG" in { name, tagline }
function parseRiotId(str) {
  const idx = str.lastIndexOf("#");
  if (idx === -1) {
    return { name: str, tagline: "EUW" };
  }
  const name = str.slice(0, idx);
  const tagline = str.slice(idx + 1);
  return { name, tagline };
}

// EU-Cluster (für EUW/EUNE)
async function getPUUIDFromRiotId(name, tagline) {
  const base = "https://europe.api.riotgames.com";
  const url = `${base}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
    name
  )}/${encodeURIComponent(tagline)}`;
  return riotGetJson(url);
}

// Plattform-URL pro Region (für Summoner/Mastery)
function getPlatformBaseUrl(region) {
  return `https://${region}.api.riotgames.com`;
}

// Summoner-Daten inkl. Level für Spielzeit-Schätzung
async function getSummonerByPUUID(puuid, region) {
  const base = getPlatformBaseUrl(region);
  const url = `${base}/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(
    puuid
  )}`;
  return riotGetJson(url);
}

// Alle Champion-Masteries eines Summoners (für Gesamt-Mastery/OPUS)
async function getAllMasteriesByPUUID(puuid, region) {
  const base = getPlatformBaseUrl(region);
  const url = `${base}/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(
    puuid
  )}`;
  return riotGetJson(url);
}

// ---------------------------------------------------------
// Express Middleware
// ---------------------------------------------------------

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------
// API-Routen
// ---------------------------------------------------------

// Health-Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", mode: USE_MOCK ? "mock" : "live" });
});

// Account-Lookup: Riot-ID -> PUUID & Region zurückgeben
app.get("/api/account", async (req, res) => {
  try {
    const riotId = req.query.riotId;
    const region = req.query.region || "euw1";

    if (!riotId) {
      return res.status(400).json({ error: "riotId ist erforderlich" });
    }

    const { name, tagline } = parseRiotId(riotId);
    const data = await getPUUIDFromRiotId(name, tagline);

    res.json({
      gameName: data.gameName,
      tagLine: data.tagLine,
      puuid: data.puuid,
      region,
    });
  } catch (err) {
    console.error("[/api/account] Fehler:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/mastery/overall
 * Aggregiert die Gesamt-Mastery aller Champions über alle Accounts.
 */
app.post("/api/mastery/overall", async (req, res) => {
  try {
    const accounts = req.body.accounts;
    if (!Array.isArray(accounts) || accounts.length === 0) {
      return res
        .status(400)
        .json({ error: "accounts-Array wird benötigt (name, region)" });
    }

    let championsMap = {}; // championId → Summe
    let championsLevel = {}; // championId → Level irrelevant

    for (const acc of accounts) {
      try {
        const { name, tagline } = parseRiotId(acc.name);
        const accountData = await getPUUIDFromRiotId(name, tagline);
        const puuid = accountData.puuid;

        const masteries = await getAllMasteriesByPUUID(puuid, acc.region);

        for (const m of masteries) {
          const id = m.championId;
          championsMap[id] = (championsMap[id] || 0) + (m.championPoints || 0);
        }
      } catch (innerErr) {
        console.error(
          `[/api/mastery/overall] Fehler bei Account ${acc.name}:`,
          innerErr.message
        );
      }
    }

    const result = Object.keys(championsMap)
      .map((cid) => ({
        championId: Number(cid),
        totalPoints: championsMap[cid],
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints);

    res.json({ champions: result });
  } catch (err) {
    console.error("[/api/mastery/overall] Fehler:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/mastery/champion
 * Aggregiert die Mastery für einen bestimmten Champion
 */
app.post("/api/mastery/champion", async (req, res) => {
  try {
    const { championId, championName, accounts } = req.body;

    if (!championId || !Array.isArray(accounts) || accounts.length === 0) {
      return res.status(400).json({
        error:
          "championId und accounts-Array (name, region) sind erforderlich",
      });
    }

    const resultAccounts = [];

    for (const acc of accounts) {
      try {
        const { name, tagline } = parseRiotId(acc.name);
        const accountData = await getPUUIDFromRiotId(name, tagline);
        const puuid = accountData.puuid;

        const base = getPlatformBaseUrl(acc.region);
        const url = `${base}/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(
          puuid
        )}/by-champion/${encodeURIComponent(championId)}`;

        let points = 0;
        let level = 0;

        try {
          const champData = await riotGetJson(url);
          points = champData.championPoints || 0;
          level = champData.championLevel || 0;
        } catch {
          // keine Mastery → 0
        }

        resultAccounts.push({
          name: acc.name,
          region: acc.region,
          points,
          level,
        });
      } catch (innerErr) {
        resultAccounts.push({
          name: acc.name,
          region: acc.region,
          points: 0,
          level: 0,
          error: innerErr.message,
        });
      }
    }

    const totalPoints = resultAccounts.reduce(
      (sum, r) => sum + (r.points || 0),
      0
    );

    res.json({
      championId,
      championName: championName || null,
      totalPoints,
      accounts: resultAccounts,
    });
  } catch (err) {
    console.error("[/api/mastery/champion] Fehler:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/playtime/profile
 * Spielzeit basierend ausschließlich auf Summoner-Level
 */
app.post("/api/playtime/profile", async (req, res) => {
  try {
    const accounts = req.body.accounts;
    if (!Array.isArray(accounts) || accounts.length === 0) {
      return res
        .status(400)
        .json({ error: "accounts-Array wird benötigt (name, region)" });
    }

    const resultAccounts = [];
    let totalHours = 0;

    for (const acc of accounts) {
      try {
        const { name, tagline } = parseRiotId(acc.name);
        const accountData = await getPUUIDFromRiotId(name, tagline);
        const puuid = accountData.puuid;

        const summoner = await getSummonerByPUUID(puuid, acc.region);
        const level = summoner.summonerLevel || 0;
        const hours = level * HOURS_PER_LEVEL;

        totalHours += hours;

        resultAccounts.push({
          name: acc.name,
          region: acc.region,
          matches: 0,
          hours,
          totalGames: 0,
          estimatedHours: hours,
          level,
          estimationSource: "level_based",
        });
      } catch (innerErr) {
        resultAccounts.push({
          name: acc.name,
          region: acc.region,
          matches: 0,
          hours: 0,
          totalGames: 0,
          estimatedHours: 0,
          level: null,
          estimationSource: null,
          error: innerErr.message,
        });
      }
    }

    return res.json({
      totalMatches: 0,
      totalHours,
      accounts: resultAccounts,
    });
  } catch (err) {
    console.error("[/api/playtime/profile] Fehler:", err.message);
    return res.status(500).json({
      error: err.message,
    });
  }
});

// ---------------------------------------------------------
// START SERVER
// ---------------------------------------------------------

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✔ Server läuft auf Port ${PORT}`);
});
