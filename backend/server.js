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

// *** Faktor: Stunden pro Account-Level (Spielzeit-Schätzung) ***
const HOURS_PER_LEVEL = 7.5;

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
  // Wir hängen jeden Request an die Queue an, damit sie nacheinander laufen.
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
      // kleine Pause bis zum nächsten Request, falls der Call sehr schnell war
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
        continue; // nächster Versuch
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Riot API Fehler ${res.status}: ${text}`);
      }

      return res.json();
    }
  };

  // neuen Job an die Queue hängen
  const next = riotQueue.then(runInQueue);
  // Fehler in der Queue abfangen, damit die Kette nicht "bricht"
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
  // Fallback
  return "europe";
}

// Alle Champion-Masteries eines Summoners holen (für /api/mastery/overall und /api/mastery)
async function getAllMasteriesByPUUID(puuid, region) {
  const base = getPlatformBaseUrl(region);
  const url = `${base}/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(
    puuid
  )}`;
  return riotGetJson(url); // Array von Masteries
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
    if (ids.length < step) {
      // weniger als 100 -> Ende erreicht
      break;
    }

    start += step;

    // Sicherheitslimit, um die API nicht zu hart zu belasten
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

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: USE_MOCK ? "ok (mock)" : "ok (live)",
    time: new Date().toISOString(),
  });
});

// GET /api/account?name=NAME#TAG&region=euw1
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
 * POST /api/mastery/overall
 * Request: { accounts: [{ name, region }, ...] }
 * Response: { champions: [{ championId, totalPoints }, ...] }
 */
app.post("/api/mastery/overall", async (req, res) => {
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
          `[/api/mastery/overall] Überspringe Account mit ungültigem Format: "${full}"`
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
          `[/api/mastery/overall] Fehler bei Account ${full} (${region}):`,
          innerErr.message
        );
        // wir machen mit den anderen Accounts weiter
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

  // LIVE – gleiche Datenbasis wie /api/mastery/overall: alle Masteries laden, dann filtern
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
        // 1) Riot-ID → PUUID
        const account = await getPUUIDFromRiotId(nameOnly, tagOnly);
        const puuid = account.puuid;

        // 2) Alle Masteries laden
        const masteries = await getAllMasteriesByPUUID(puuid, region);

        // 3) Gewünschten Champion finden
        const m = masteries.find(
          (entry) => Number(entry.championId) === champIdNum
        );

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
//   -> robuster: Level & Matches getrennt behandeln
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
        // Schritt 1: PUUID holen
        const account = await getPUUIDFromRiotId(nameOnly, tagOnly);
        const puuid = account.puuid;

        let games = 0;
        let level = 0;
        let hadMatchError = false;
        let hadLevelError = false;

        // Schritt 2: Summoner-Level (eigener try/catch)
        try {
          const summoner = await getSummonerByPUUID(puuid, region);
          level =
            summoner && summoner.summonerLevel ? summoner.summonerLevel : 0;
        } catch (e) {
          hadLevelError = true;
          console.warn(
            "[playtime] Summoner-Level Fehler bei",
            full,
            e.message
          );
        }

        // Schritt 3: Match-Anzahl (eigener try/catch)
        try {
          games = await getMatchCountForPUUID(puuid, region);
        } catch (e) {
          hadMatchError = true;
          console.warn(
            "[playtime] Match-V5 Fehler bei",
            full,
            e.message
          );
        }

        const hoursFromMatches = Math.round(games * 0.5); // 30 Min pro Match
        const hoursFromLevel = Math.round(level * HOURS_PER_LEVEL); // pauschal pro Level

        let estimatedHours = Math.max(hoursFromMatches, hoursFromLevel);
        let estimationSource = "matches";

        if (games === 0 && level > 0) {
          // nur Level verfügbar
          estimationSource = "level_only";
          estimatedHours = hoursFromLevel;
        } else if (
          games > 0 &&
          level > 0 &&
          hoursFromLevel > hoursFromMatches
        ) {
          // Level gibt höheren Wert -> wir boosten
          estimationSource = "level_boost";
        }

        if (games === 0 && level === 0 && (hadMatchError || hadLevelError)) {
          // gar nichts bekommen -> echter Fehler
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
});
