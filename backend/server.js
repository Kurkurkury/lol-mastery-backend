// server.js – Mock + Live (Riot) per .env schaltbar
// MOCK_MODE=true  -> nur Mock-Daten
// MOCK_MODE=false -> echte Riot-API

const dotenv = require("dotenv");
dotenv.config({ override: true });

const axios = require("axios"); // aktuell nicht genutzt, kann aber bleiben
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const fetch = require("cross-fetch");
const morgan = require("morgan");

const app = express();

// Wichtig für Hosting: Port vom Hoster verwenden, sonst 4000
const PORT = process.env.PORT || 4000;

const USE_MOCK = process.env.MOCK_MODE === "true";
const RIOT_API_KEY = process.env.RIOT_API_KEY || null;

// *** Faktor: Stunden pro Account-Level (Spielzeit-Schätzung) ***
const HOURS_PER_LEVEL = 7.5;

console.log("MOCK_MODE:", USE_MOCK ? "true (Mock aktiv)" : "false (Riot-Live)");

if (!USE_MOCK) {
  // ✅ KEIN API-KEY-LOGGING (Security)
  const looksValid =
    RIOT_API_KEY &&
    typeof RIOT_API_KEY === "string" &&
    RIOT_API_KEY.startsWith("RGAPI-");
  if (!looksValid) {
    console.error("❌ RIOT_API_KEY in .env fehlt oder ist ungültig.");
    process.exit(1);
  }
  console.log("RIOT_API_KEY: vorhanden (nicht geloggt)");
}

// ---- Middleware ----
app.use(morgan("tiny")); // ✅ Render-Logs zeigen jede Anfrage
app.use(cors());
app.use(express.json());

// ✅ Static absolut (Render/WorkingDir-proof)
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

// Optional: jedes Request einmal kurz sichtbar machen (zusätzlich zu morgan)
app.use((req, res, next) => {
  // Nur API (damit Logs nicht zugespammt werden von assets)
  if (req.path.startsWith("/api") || req.path === "/health") {
    console.log(`[REQ] ${req.method} ${req.path}`);
  }
  next();
});

// ---------- App-Meta (Version / Startzeit) ----------
const appStartedAt = new Date().toISOString();

app.get("/api/app-meta", (req, res) => {
  res.json({ lastUpdatedIso: appStartedAt });
});

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

// --- Riot API Call mit einfachem Rate-Limit & Retry bei 429 ---
// Wir serialisieren alle Riot-Requests leicht und bauen kleine Pausen ein,
// damit Dev-Keys nicht sofort ins Rate-Limit laufen.

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Promise-Queue für Riot-Requests (wird sequentiell abgearbeitet)
let riotQueue = Promise.resolve();

// Mindestabstand zwischen zwei Riot-Requests (in ms).
// 120 ms ≈ max. ~8–9 Requests/Sekunde, deutlich unterhalb des Riot-Limits.
const RIOT_MIN_DELAY_MS = 120;

async function riotGetJson(url) {
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

// Riot-ID → Account (PUUID)
async function getPUUIDFromRiotId(name, tagline) {
  const base = "https://europe.api.riotgames.com";
  const url = `${base}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
    name
  )}/${encodeURIComponent(tagline)}`;

  return riotGetJson(url);
}

// Regionale Plattform-URL für Champion-Mastery / Summoner
function getPlatformBaseUrl(region) {
  return `https://${region}.api.riotgames.com`;
}

// Match-V5 Routing-Cluster für Spielzeit
function getMatchCluster(region) {
  const r = (region || "").toLowerCase();
  if (["euw1", "eun1", "tr1", "ru"].includes(r)) return "europe";
  if (["na1", "br1", "la1", "la2", "oc1"].includes(r)) return "americas";
  if (["kr", "jp1"].includes(r)) return "asia";
  if (["sg2", "ph2", "vn2", "th2", "tw2"].includes(r)) return "sea";
  return "europe";
}

// Alle Champion-Masteries eines Summoners holen
async function getAllMasteriesByPUUID(puuid, region) {
  const base = getPlatformBaseUrl(region);
  const url = `${base}/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(
    puuid
  )}`;
  return riotGetJson(url);
}

// Anzahl Matches für PUUID zählen (Match-V5)
async function getMatchCountForPUUID(puuid, region) {
  const cluster = getMatchCluster(region);
  const base = `https://${cluster}.api.riotgames.com`;

  let start = 0;
  const step = 100;
  let total = 0;

  while (true) {
    const url = `${base}/lol/match/v5/matches/by-puuid/${encodeURIComponent(
      puuid
    )}/ids?start=${start}&count=${step}`;

    let ids = [];
    try {
      ids = await riotGetJson(url);
    } catch (err) {
      console.warn(
        `[getMatchCountForPUUID] Fehler beim Laden der Matches:`,
        err.message
      );
      break;
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      break;
    }

    total += ids.length;
    if (ids.length < step) break;

    start += step;

    // Sicherheitslimit
    if (start >= 2000) {
      console.log(
        `[getMatchCountForPUUID] Abbruch bei >= 2000 Matches (PUUID=${puuid})`
      );
      break;
    }
  }

  return total;
}

// Summoner-Daten (u.a. Level) per PUUID holen
async function getSummonerByPUUID(puuid, region) {
  const base = getPlatformBaseUrl(region);
  const url = `${base}/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(
    puuid
  )}`;
  return riotGetJson(url);
}

// ---------- ROUTES ----------

// Health check (bestehend)
app.get("/health", (req, res) => {
  res.json({
    status: USE_MOCK ? "ok (mock)" : "ok (live)",
    time: new Date().toISOString(),
  });
});

// Optional: Alias (praktisch fürs Frontend)
app.get("/api/health", (req, res) => {
  res.json({
    status: USE_MOCK ? "ok (mock)" : "ok (live)",
    time: new Date().toISOString(),
  });
});

// GET /api/account?name=NAME#TAG&region=euw1
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
 * POST /api/mastery/overall
 * Request: { accounts: [{ name, region }, ...] }
 * Response: { champions: [{ championId, totalPoints }, ...] }
 */
app.post("/api/mastery/overall", async (req, res) => {
  const { accounts } = req.body || {};

  if (!Array.isArray(accounts) || accounts.length === 0) {
    return res.status(400).json({ error: "accounts fehlt/leer" });
  }

  // MOCK
  if (USE_MOCK) {
    // ✅ robust: entweder totalPoints direkt nutzen oder aus accounts summieren
    const computedTotal = (mockMastery?.accounts || []).reduce(
      (sum, acc) => sum + (acc.points || 0),
      0
    );
    const totalPoints =
      typeof mockMastery?.totalPoints === "number"
        ? mockMastery.totalPoints
        : computedTotal;

    const championId = mockMastery?.championId || 0;

    return res.json({
      champions: [
        {
          championId,
          totalPoints,
        },
      ],
    });
  }

  // LIVE
  try {
    const totals = new Map(); // championId -> totalPoints

    for (const acc of accounts) {
      const full = (acc.name || "").trim();
      const region = (acc.region || "euw1").toLowerCase();

      if (!full.includes("#")) {
        console.warn(
          `[/api/mastery/overall] Überspringe Account mit ungültigem Format: "${full}"`
        );
        continue;
      }

      const [nameOnly, tagOnly] = full.split("#");

      try {
        const account = await getPUUIDFromRiotId(nameOnly, tagOnly);
        const puuid = account.puuid;

        const masteries = await getAllMasteriesByPUUID(puuid, region);

        for (const m of masteries) {
          const champId = m.championId;
          const points = m.championPoints || 0;

          const prev = totals.get(champId) || 0;
          totals.set(champId, prev + points);
        }
      } catch (innerErr) {
        console.error(
          `[/api/mastery/overall] Fehler bei Account ${full} (${region}):`,
          innerErr.message
        );
        continue;
      }
    }

    const champions = Array.from(totals.entries())
      .map(([championId, totalPoints]) => ({
        championId,
        totalPoints,
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints);

    return res.json({ champions });
  } catch (err) {
    console.error("[/api/mastery/overall] Fehler:", err.message);
    return res
      .status(500)
      .json({ error: "Interner Fehler bei /api/mastery/overall" });
  }
});

// POST /api/mastery – EIN Champion, pro Account aufgeschlüsselt
app.post("/api/mastery", async (req, res) => {
  const { championId, championName, accounts } = req.body || {};

  if (!championId) {
    return res.status(400).json({ error: "championId fehlt" });
  }
  if (!Array.isArray(accounts) || accounts.length === 0) {
    return res.status(400).json({ error: "accounts fehlt/leer" });
  }

  // MOCK
  if (USE_MOCK) {
    const results = (mockMastery?.accounts || []).map((acc) => ({
      name: acc.name,
      region: acc.region,
      points: acc.points,
      level: acc.level,
    }));

    const computedTotal = results.reduce((sum, r) => sum + (r.points || 0), 0);
    const totalPoints =
      typeof mockMastery?.totalPoints === "number"
        ? mockMastery.totalPoints
        : computedTotal;

    return res.json({
      championId,
      championName: championName || mockMastery?.championName || null,
      totalPoints,
      accounts: results,
    });
  }

  // LIVE
  try {
    const results = [];
    const champIdNum = Number(championId);

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
        const account = await getPUUIDFromRiotId(nameOnly, tagOnly);
        const puuid = account.puuid;

        const masteries = await getAllMasteriesByPUUID(puuid, region);

        const m = masteries.find((entry) => Number(entry.championId) === champIdNum);

        results.push({
          name: `${account.gameName}#${account.tagLine}`,
          region,
          points: m ? m.championPoints : 0,
          level: m ? m.championLevel : 0,
        });
      } catch (innerErr) {
        console.error(
          `[/api/mastery] Fehler bei Account ${full} (${region}):`,
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
    console.error("[/api/mastery] Fehler:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// =========================================
//   SPIELZEIT FÜR EIN PROFIL (MATCH-V5 + LEVEL)
// =========================================
app.post("/api/playtime/profile", async (req, res) => {
  const { accounts } = req.body || {};

  if (!Array.isArray(accounts) || accounts.length === 0) {
    return res.status(400).json({ error: "accounts fehlt/leer" });
  }

  // MOCK MODE
  if (USE_MOCK) {
    return res.json({
      totalGames: 1234,
      totalHours: Math.round(1234 * 0.5),
      accounts: [
        {
          name: "MockAccount#EUW",
          region: "euw1",
          totalGames: 1234,
          estimatedHours: 617,
          estimationSource: "mock",
          level: 200,
          hoursFromMatches: Math.round(1234 * 0.5),
          hoursFromLevel: Math.round(200 * HOURS_PER_LEVEL),
        },
      ],
    });
  }

  try {
    const resultAccounts = [];
    let totalGames = 0;
    let totalHours = 0;

    for (const acc of accounts) {
      const full = (acc.name || "").trim();
      const region = (acc.region || "euw1").toLowerCase();

      if (!full.includes("#")) {
        resultAccounts.push({
          name: full,
          region,
          totalGames: 0,
          estimatedHours: 0,
          estimationSource: "error",
          error: "Ungültiges Format (NAME#TAG erwartet)",
        });
        continue;
      }

      const [nameOnly, tagOnly] = full.split("#");

      try {
        const account = await getPUUIDFromRiotId(nameOnly, tagOnly);
        const puuid = account.puuid;

        let games = 0;
        let level = 0;
        let hadMatchError = false;
        let hadLevelError = false;

        // Summoner-Level
        try {
          const summoner = await getSummonerByPUUID(puuid, region);
          level = summoner && summoner.summonerLevel ? summoner.summonerLevel : 0;
        } catch (e) {
          hadLevelError = true;
          console.warn("[playtime] Summoner-Level Fehler bei", full, e.message);
        }

        // Match-Anzahl
        try {
          games = await getMatchCountForPUUID(puuid, region);
        } catch (e) {
          hadMatchError = true;
          console.warn("[playtime] Match-V5 Fehler bei", full, e.message);
        }

        const hoursFromMatches = Math.round(games * 0.5);
        const hoursFromLevel = Math.round(level * HOURS_PER_LEVEL);

        let estimatedHours = Math.max(hoursFromMatches, hoursFromLevel);
        let estimationSource = "matches";

        if (games === 0 && level > 0) {
          estimationSource = "level_only";
          estimatedHours = hoursFromLevel;
        } else if (games > 0 && level > 0 && hoursFromLevel > hoursFromMatches) {
          estimationSource = "level_boost";
        }

        if (games === 0 && level === 0 && (hadMatchError || hadLevelError)) {
          estimationSource = "error";
        }

        totalGames += games;
        totalHours += estimatedHours;

        resultAccounts.push({
          name: `${account.gameName}#${account.tagLine}`,
          region,
          totalGames: games,
          estimatedHours,
          estimationSource,
          level,
          hoursFromMatches,
          hoursFromLevel,
        });
      } catch (err) {
        console.error(
          "Spielzeit Fehler bei Account (PUUID/Account):",
          full,
          err.message
        );
        resultAccounts.push({
          name: full,
          region,
          totalGames: 0,
          estimatedHours: 0,
          estimationSource: "error",
          error: err.message,
        });
      }
    }

    return res.json({
      totalGames,
      totalHours,
      accounts: resultAccounts,
    });
  } catch (err) {
    console.error("[/api/playtime/profile] Fehler:", err.message);
    return res.status(500).json({
      error: "Interner Fehler bei /api/playtime/profile: " + err.message,
    });
  }
});

// ---------- START SERVER ----------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✔ Server läuft auf Port ${PORT}`);
  console.log(`✔ Public dir: ${publicDir}`);
});
