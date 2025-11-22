// server.js – Mock + Live (Riot) per .env schaltbar
// MOCK_MODE=true  -> nur Mock-Daten
// MOCK_MODE=false -> echte Riot-API

const dotenv = require("dotenv");
dotenv.config({ override: true });

console.log("RIOT_API_KEY aus .env:", process.env.RIOT_API_KEY);

const fetch = require("cross-fetch");
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 4000;

const USE_MOCK = process.env.MOCK_MODE === "true";
const RIOT_API_KEY = process.env.RIOT_API_KEY || null;

// Stunden pro Level (Backup-Faktor, wenn Matches fehlen)
const HOURS_PER_LEVEL = 7.5;

console.log("MOCK_MODE:", USE_MOCK ? "true (Mock aktiv)" : "false (Riot-Live)");

if (!USE_MOCK) {
  if (!RIOT_API_KEY || !RIOT_API_KEY.startsWith("RGAPI-")) {
    console.error("❌ RIOT_API_KEY in .env fehlt oder ungültig!");
    process.exit(1);
  }
  console.log("RIOT_API_KEY geladen:", RIOT_API_KEY.slice(0, 10) + "...");
}

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

let mockMastery = null;
if (USE_MOCK) {
  try {
    mockMastery = JSON.parse(
      fs.readFileSync(path.join(__dirname, "data", "mock-mastery.json"), "utf8")
    );
    console.log("✔ mock-mastery.json geladen");
  } catch (e) {
    console.error("❌ MOCK-Datei nicht gefunden:", e.message);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// Hilfsfunktionen
// -----------------------------------------------------------------------------

async function riotGetJson(url) {
  const res = await fetch(url, {
    headers: { "X-Riot-Token": RIOT_API_KEY },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Riot API Fehler ${res.status}: ${text}`);
  }

  return res.json();
}

async function getPUUIDFromRiotId(name, tag) {
  const base = "https://europe.api.riotgames.com";
  const url = `${base}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
    name
  )}/${encodeURIComponent(tag)}`;

  return riotGetJson(url);
}

function getPlatformBaseUrl(region) {
  return `https://${region}.api.riotgames.com`;
}

function getMatchCluster(region) {
  region = region.toLowerCase();
  if (["euw1", "eun1", "tr1", "ru"].includes(region)) return "europe";
  if (["na1", "br1", "la1", "la2", "oc1"].includes(region)) return "americas";
  if (["kr", "jp1"].includes(region)) return "asia";
  if (["sg2", "ph2", "vn2", "th2", "tw2"].includes(region)) return "sea";
  return "europe";
}

// -----------------------------------------------------------------------------
// NEU: Matches OHNE LIMIT laden (bis Riot nichts mehr liefert)
// -----------------------------------------------------------------------------

async function getMatchCountForPUUID(puuid, region) {
  const cluster = getMatchCluster(region);
  const base = `https://${cluster}.api.riotgames.com`;

  let total = 0;
  let start = 0;
  const step = 100;

  while (true) {
    const url = `${base}/lol/match/v5/matches/by-puuid/${encodeURIComponent(
      puuid
    )}/ids?start=${start}&count=${step}`;

    let ids = [];

    try {
      ids = await riotGetJson(url);
    } catch (err) {
      console.warn("[MATCHES] Fehler:", err.message);
      break;
    }

    if (!Array.isArray(ids) || ids.length === 0) break;

    total += ids.length;

    // Wenn Riot weniger als 100 zurückgibt → ENDE
    if (ids.length < step) break;

    start += step;

    // Minimaler Sicherheits-Stop bei 20.000 Matches
    if (start >= 20000) {
      console.log("⚠️ Sicherheitslimit erreicht (20k Matches)");
      break;
    }
  }

  return total;
}

async function getSummonerByPUUID(puuid, region) {
  const base = getPlatformBaseUrl(region);
  return riotGetJson(
    `${base}/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`
  );
}

// -----------------------------------------------------------------------------
// ROUTES
// -----------------------------------------------------------------------------

app.get("/health", (req, res) => {
  res.json({
    status: USE_MOCK ? "ok (mock)" : "ok (live)",
    time: new Date().toISOString(),
  });
});

// Riot-ID → Account
app.get("/api/account", async (req, res) => {
  const full = (req.query.name || "").trim();
  const region = (req.query.region || "euw1").toLowerCase();

  if (!full.includes("#")) return res.status(400).json({ error: "Format NAME#TAG erwartet" });

  const [name, tag] = full.split("#");

  if (USE_MOCK) {
    return res.json({
      gameName: name,
      tagLine: tag,
      puuid: "MOCK-PUUID",
      region,
    });
  }

  try {
    const data = await getPUUIDFromRiotId(name, tag);
    res.json({
      gameName: data.gameName,
      tagLine: data.tagLine,
      puuid: data.puuid,
      region,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -----------------------------------------------------------------------------
// MATCHES + LEVEL → SPIELZEIT
// -----------------------------------------------------------------------------

app.post("/playtime/profile", async (req, res) => {
  const { accounts } = req.body || {};

  if (!Array.isArray(accounts) || accounts.length === 0)
    return res.status(400).json({ error: "accounts fehlt/leer" });

  if (USE_MOCK) {
    return res.json({
      totalGames: 1234,
      totalHours: 600,
      accounts: [
        {
          name: "Mock#EUW",
          region: "euw1",
          totalGames: 1234,
          estimatedHours: 600,
          estimationSource: "mock",
        },
      ],
    });
  }

  let totalGames = 0;
  let totalHours = 0;
  const results = [];

  for (const acc of accounts) {
    const full = (acc.name || "").trim();
    const region = (acc.region || "euw1").toLowerCase();

    if (!full.includes("#")) {
      results.push({
        name: full,
        region,
        totalGames: 0,
        estimatedHours: 0,
        estimationSource: "error",
        error: "Ungültiges Format NAME#TAG",
      });
      continue;
    }

    const [n, t] = full.split("#");

    try {
      const account = await getPUUIDFromRiotId(n, t);
      const puuid = account.puuid;

      const [gameCount, summoner] = await Promise.all([
        getMatchCountForPUUID(puuid, region),
        getSummonerByPUUID(puuid, region),
      ]);

      const level = summoner?.summonerLevel || 0;

      const hoursMatches = Math.round(gameCount * 0.5);
      const hoursLevel = Math.round(level * HOURS_PER_LEVEL);

      const estimatedHours = Math.max(hoursMatches, hoursLevel);
      const estimationSource =
        estimatedHours === hoursMatches ? "matches" : "level_boost";

      totalGames += gameCount;
      totalHours += estimatedHours;

      results.push({
        name: `${account.gameName}#${account.tagLine}`,
        region,
        totalGames: gameCount,
        estimatedHours,
        estimationSource,
        level,
        hoursMatches,
        hoursLevel,
      });
    } catch (e) {
      results.push({
        name: full,
        region,
        totalGames: 0,
        estimatedHours: 0,
        estimationSource: "error",
        error: e.message,
      });
    }
  }

  res.json({
    totalGames,
    totalHours,
    accounts: results,
  });
});

app.listen(PORT, "0.0.0.0", () =>
  console.log(`✔ Server läuft auf Port ${PORT}`)
);
