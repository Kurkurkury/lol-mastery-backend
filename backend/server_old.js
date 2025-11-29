// server.js
// Start: node server.js
// Benötigt: RIOT_API_KEY in der ENV (z.B. RIOT_API_KEY=abc123 node server.js)

const express = require("express");
const fetch = require("cross-fetch");
const cors = require("cors");
const morgan = require("morgan");

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan("tiny"));

// Umgebung: setze RIOT_API_KEY als Umgebungsvariable
const RIOT_API_KEY = process.env.RIOT_API_KEY;
if (!RIOT_API_KEY) {
  console.warn("WARN: RIOT_API_KEY nicht gesetzt. Requests werden fehlschlagen.");
}

// Region/Platform routing notes:
// Für Summoner-V4 und Champion-Mastery-V4 wird platform-routing value verwendet.
// Beispiele: "euw1", "na1", "eun1", "kr" etc.
// Für simplicity: client sendet region (z.B. euw1). Validate basic format.

function riotFetch(url) {
  return fetch(url, {
    headers: { "X-Riot-Token": RIOT_API_KEY }
  });
}

// Hilfsfunktion: Summoner → encryptedSummonerId
async function getSummoner(platform, name) {
  const encoded = encodeURIComponent(name);
  const url = `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-name/${encoded}`;
  const res = await riotFetch(url);
  if (!res.ok) {
    const text = await res.text().catch(()=>"");
    throw new Error(`Fehler Summoner lookup ${res.status} ${text}`);
  }
  return res.json(); // enthält id (encryptedSummonerId), accountId, puuid, name
}

// Hilfsfunktion: Champion-Mastery für Summoner holen
async function getChampionMastery(platform, encryptedSummonerId) {
  const url = `https://${platform}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-summoner/${encryptedSummonerId}`;
  const res = await riotFetch(url);
  if (!res.ok) {
    const text = await res.text().catch(()=>"");
    throw new Error(`Fehler Champion-Mastery ${res.status} ${text}`);
  }
  const data = await res.json(); // Array von mastery objects
  return data;
}

// Optional: Map ChampionId -> ChampionName
// Für korrekte Namen bräuchten wir die champion.json (Data Dragon) oder eine Mapping-Tabelle.
// Hier verwenden wir Data Dragon (keine Auth nötig): /cdn/<vers>/data/en_US/champion.json
// Simpler Ansatz: entferne Champion-IDs und gib id zurück, oder lade die aktuelle champ list einmal.
let championIdToNameCache = null;
async function loadChampionMap() {
  if (championIdToNameCache) return championIdToNameCache;
  // Hole neueste Data Dragon version
  const verRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
  const versions = await verRes.json();
  const latest = versions[0];
  const champUrl = `https://ddragon.leagueoflegends.com/cdn/${latest}/data/en_US/champion.json`;
  const res = await fetch(champUrl);
  const json = await res.json();
  // json.data: keys sind champion keys wie Aatrox, value.key = numeric id as string
  const map = new Map();
  Object.values(json.data).forEach(ch => {
    // ch.key ist z.B. "266" and ch.id is "Aatrox". We'll use ch.id (name)
    map.set(Number(ch.key), ch.id); // numeric id -> champion key/name
  });
  championIdToNameCache = map;
  return map;
}

// Endpoint: GET /api/account?name=Liveforce666&region=euw1
app.get("/api/account", async (req, res) => {
  try {
    const nameRaw = req.query.name;
    const region = (req.query.region || "euw1").toLowerCase();

    if (!nameRaw) return res.status(400).json({ error: "name required" });

    // Basic validation region (platform routing): allow letters/numbers
    if (!/^[a-z0-9]+$/.test(region)) {
      return res.status(400).json({ error: "invalid region" });
    }

    // Lookup summoner
    const summ = await getSummoner(region, nameRaw);
    const encryptedId = summ.id; // encrypted summoner id
    const masteryArray = await getChampionMastery(region, encryptedId);

    // Load champion map to resolve championId->name
    const champMap = await loadChampionMap();

    // Convert masteryArray to your file format: champions: [{ name, masteryPoints }]
    const champions = masteryArray.map(m => {
      const champName = champMap.get(m.championId) || String(m.championId);
      return { name: champName, masteryPoints: m.championPoints };
    });

    const out = {
      id: summ.name.replace(/\s/g, ""), // small normalized id
      name: summ.name,
      lastUpdated: new Date().toISOString(),
      champions
    };

    res.json(out);
  } catch (err) {
    console.error(err);
    // mappe Riot status codes sauberer falls möglich
    return res.status(500).json({ error: String(err.message) });
  }
});

// Optional: statische Auslieferung deines public-Ordners (Frontend)
const path = require("path");
app.use(express.static(path.join(__dirname, "public")));

// Start
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Proxy Server läuft auf ${PORT}`);
  console.log(`Endpoint: GET /api/account?name=<summoner>&region=<platform>`);
});
