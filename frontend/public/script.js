// ======================
//   KONFIGURATION
// ======================
const API_BASE = "https://lol-mastery-backend-6jl7.onrender.com";

const LS_PROFILES = "mastery_profiles_v1";
const LS_SELECTED_PROFILE = "mastery_selected_profile_v1";

// Default-Profile mit deinen Accounts aus den Screenshots
const DEFAULT_PROFILES = {
  "Profil 1": [
    // 1. Screenshot
    { name: "Asphyx#SKT", region: "eun1" },
    { name: "Last devotion#stk", region: "eun1" },
    { name: "Life force666#euw", region: "euw1" },
    { name: "Silence#bow", region: "euw1" },
    { name: "God complex#dra", region: "euw1" },
    { name: "Neuvilette#honor", region: "euw1" },
    { name: "God complex#aprs", region: "euw1" },
    { name: "Gianeentruan#1807", region: "euw1" },
    { name: "Kurukuruboy#euw", region: "euw1" },
    { name: "Silence#num2", region: "euw1" },

    // 2. Screenshot
    { name: "Noffeed#2881", region: "eun1" },
    { name: "The dark rose#euwu", region: "euw1" },
    { name: "Spaceglider#pew", region: "euw1" },
    { name: "Emperor#ban", region: "euw1" },
    { name: "Swogenthach#6501", region: "euw1" },
    { name: "Life Force666#num2", region: "euw1" },
    { name: "Nostalgia#1973", region: "euw1" },
    { name: "Taszildelm#1049", region: "euw1" },
    { name: "Teaprach#3789", region: "euw1" },
    { name: "Spaceglider#aprs", region: "euw1" },
    { name: "VoiceOfThePast#RNK1", region: "euw1" },
    { name: "kelynali#6221", region: "euw1" },

    // 3. Screenshot
    { name: "Fluffyunicorn#4090", region: "euw1" },
    { name: "Silence#joy", region: "euw1" },
    { name: "Nice guy#yeet", region: "euw1" },
    { name: "T1 gumasushi#euwe", region: "euw1" },
    { name: "Crownedbydeath#skt", region: "eun1" },
    { name: "Keaiqdar#5734", region: "eun1" },
    { name: "ilovewaffles#yipii", region: "eun1" },
    { name: "Healsorhandcuffs#skt", region: "eun1" },
    { name: "Shield my heart#skt", region: "eun1" },
    { name: "Free hugs#skt", region: "eun1" },
    { name: "Tacos#skt", region: "eun1" },
    { name: "Deep Sea#euwu", region: "eun1" },

    // 4. Screenshot
    { name: "Vaimgon#4340", region: "na1" },
    { name: "Exodia#yrd", region: "eun1" },
    { name: "Broken Heart#aprs", region: "eun1" },
    { name: "Shawtyhunt3r#skt", region: "euw1" },
  ],
};

// ======================
//   DOM-REFERENZEN
// ======================
const profileSelect = document.getElementById("profileSelect");
const newProfileName = document.getElementById("newProfileName");
const addProfileBtn = document.getElementById("addProfileBtn");

const accountNameInput = document.getElementById("accountName");
const accountRegionSelect = document.getElementById("accountRegion");
const addAccountBtn = document.getElementById("addAccountBtn");
const accountListEl = document.getElementById("accountList");
const toggleAccountsBtn = document.getElementById("toggleAccountsBtn");

const loadDefaultsBtn = document.getElementById("loadDefaultsBtn");

const championNameInput = document.getElementById("championName");
const championSuggestionsEl = document.getElementById("championSuggestions");
const aggregateBtn = document.getElementById("aggregateBtn");
const aggregateStatusEl = document.getElementById("aggregateStatus");
const aggregateResultEl = document.getElementById("aggregateResult");

const overallBtn = document.getElementById("overallBtn");
const overallStatusEl = document.getElementById("overallStatus");
const overallResultEl = document.getElementById("overallResult");

// Spielzeit
const currentProfileLabel = document.getElementById("currentProfileLabel");
const playtimeBtn = document.getElementById("playtimeBtn");
const playtimeStatusEl = document.getElementById("playtimeStatus");
const playtimeResultEl = document.getElementById("playtimeResult");

// optional: App-Updated-Anzeige (falls Element existiert)
const appLastUpdatedEl = document.getElementById("appLastUpdatedValue");

// Teemo-Schnellbutton
const teemoQuickBtn = document.getElementById("teemoQuickBtn");

// ======================
//   RUNTIME-STATE
// ======================
let profiles = {};
let currentProfile = null;

let accountsVisible = true;

let championDataLoaded = false;
let championMap = {};
let championList = [];
let championById = {};

// ======================
//   PROFILE-SYSTEM
// ======================

function ensureDefaultProfilesLoaded() {
  if (
    !profiles ||
    typeof profiles !== "object" ||
    !Object.keys(profiles).length ||
    !profiles["Profil 1"] ||
    !Array.isArray(profiles["Profil 1"]) ||
    profiles["Profil 1"].length === 0
  ) {
    profiles = { ...DEFAULT_PROFILES };
  }
}

function saveProfiles() {
  localStorage.setItem(LS_PROFILES, JSON.stringify(profiles));
  if (currentProfile) {
    localStorage.setItem(LS_SELECTED_PROFILE, currentProfile);
  }
}

function updateCurrentProfileLabel() {
  if (currentProfileLabel) {
    currentProfileLabel.textContent = currentProfile || "–";
  }
}

function getAccounts() {
  return profiles[currentProfile] || [];
}

function setAccounts(list) {
  profiles[currentProfile] = list;
  saveProfiles();
}

function renderAccounts() {
  const accounts = getAccounts();
  accountListEl.innerHTML = "";

  if (!accounts.length) {
    const li = document.createElement("li");
    li.style.opacity = "0.6";
    li.textContent = "Keine Accounts im Profil.";
    accountListEl.appendChild(li);
    return;
  }

  accounts.forEach((acc, index) => {
    const li = document.createElement("li");

    const span = document.createElement("span");
    span.textContent = `${acc.name} `;
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = acc.region.toUpperCase();
    span.appendChild(pill);

    const delBtn = document.createElement("button");
    delBtn.textContent = "Entf.";
    delBtn.className = "secondary small-btn";
    delBtn.onclick = () => {
      const updated = getAccounts().filter((_, i) => i !== index);
      setAccounts(updated);
      renderAccounts();
    };

    li.appendChild(span);
    li.appendChild(delBtn);
    accountListEl.appendChild(li);
  });
}

function renderProfileSelect() {
  profileSelect.innerHTML = "";
  Object.keys(profiles).forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    if (p === currentProfile) opt.selected = true;
    profileSelect.appendChild(opt);
  });
  updateCurrentProfileLabel();
  renderAccounts();
}

function switchProfile(newProfile) {
  currentProfile = newProfile;
  saveProfiles();
  updateCurrentProfileLabel();
  renderAccounts();
}

function createProfile() {
  const name = (newProfileName.value || "").trim();
  if (!name) return;
  if (profiles[name]) {
    alert("Profil existiert bereits.");
    return;
  }
  profiles[name] = [];
  newProfileName.value = "";
  currentProfile = name;
  saveProfiles();
  renderProfileSelect();
}

function loadProfiles() {
  let storedProfiles = null;

  try {
    const raw = localStorage.getItem(LS_PROFILES);
    if (raw) {
      storedProfiles = JSON.parse(raw);
    }
  } catch {
    storedProfiles = null;
  }

  if (!storedProfiles || typeof storedProfiles !== "object" || !Object.keys(storedProfiles).length) {
    profiles = { ...DEFAULT_PROFILES };
  } else {
    profiles = storedProfiles;
  }

  ensureDefaultProfilesLoaded();

  const savedProfile = localStorage.getItem(LS_SELECTED_PROFILE);
  if (savedProfile && profiles[savedProfile]) {
    currentProfile = savedProfile;
  } else if (profiles["Profil 1"]) {
    currentProfile = "Profil 1";
  } else {
    currentProfile = Object.keys(profiles)[0] || null;
  }

  saveProfiles();
  renderProfileSelect();
}

function handleLoadDefaultAccounts() {
  if (!profiles || typeof profiles !== "object") {
    profiles = {};
  }

  const defaultProfileName = "Profil 1";
  const defaults = DEFAULT_PROFILES[defaultProfileName] || [];

  if (!defaults.length) {
    console.warn("Keine Standard-Accounts in DEFAULT_PROFILES gefunden.");
    return;
  }

  profiles[defaultProfileName] = defaults.map((acc) => ({
    name: acc.name,
    region: acc.region,
  }));

  currentProfile = defaultProfileName;

  if (accountListEl && toggleAccountsBtn) {
    accountsVisible = true;
    accountListEl.style.display = "block";
    toggleAccountsBtn.textContent = "Accounts einklappen";
  }

  saveProfiles();
  renderProfileSelect();
  renderAccounts();
}

// ======================
//   ACCOUNT-HANDLING
// ======================
function sortAccountsByRegionAndName(list) {
  const regionOrder = ["euw1", "eun1", "na1", "kr", "jp1"];
  const fallbackIndex = 999;

  return list.slice().sort((a, b) => {
    const ra = regionOrder.indexOf(a.region);
    const rb = regionOrder.indexOf(b.region);
    const rDiff =
      (ra === -1 ? fallbackIndex : ra) - (rb === -1 ? fallbackIndex : rb);
    if (rDiff !== 0) return rDiff;

    return (a.name || "").localeCompare(b.name || "", "de-CH", {
      sensitivity: "base",
    });
  });
}

function addAccount() {
  if (!currentProfile) {
    alert("Kein Profil ausgewählt.");
    return;
  }

  const rawName = (accountNameInput.value || "").trim();
  const region = accountRegionSelect.value;

  if (!rawName) {
    alert("Bitte einen Summoner-Namen eingeben (z.B. Asphyx#SKT).");
    return;
  }

  const existing = getAccounts();
  const alreadyExists = existing.some(
    (a) =>
      a.region === region &&
      (a.name || "").toLowerCase() === rawName.toLowerCase()
  );

  if (alreadyExists) {
    alert("Dieser Account ist in diesem Profil bereits vorhanden.");
    return;
  }

  const updated = sortAccountsByRegionAndName([
    ...existing,
    { name: rawName, region },
  ]);

  setAccounts(updated);
  renderAccounts();

  accountNameInput.value = "";
}

// ======================
//   CHAMPION-DATEN
// ======================
function normalizeChampionKey(s) {
  return s.toLowerCase().replace(/['\.\s]/g, "");
}

async function loadChampionData() {
  if (championDataLoaded) return;

  const versionsRes = await fetch(
    "https://ddragon.leagueoflegends.com/api/versions.json"
  );
  const versions = await versionsRes.json();
  const latest = versions[0];

  const champsRes = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${latest}/data/en_US/champion.json`
  );
  const champsJson = await champsRes.json();

  const data = champsJson.data;
  championMap = {};
  championList = [];
  championById = {};

  for (const key in data) {
    const c = data[key];
    const entry = {
      id: parseInt(c.key, 10),
      name: c.name,
      rawId: c.id,
    };

    const nk1 = normalizeChampionKey(c.name);
    const nk2 = normalizeChampionKey(c.id);

    championMap[nk1] = entry;
    championMap[nk2] = entry;

    championList.push(entry);
    championById[entry.id] = entry;
  }

  championDataLoaded = true;
}

function showChampionSuggestions(list) {
  if (!list.length) {
    championSuggestionsEl.style.display = "none";
    return;
  }
  championSuggestionsEl.innerHTML = "";
  list.forEach((c) => {
    const li = document.createElement("li");
    li.innerHTML = `${c.name} <span class="champion-key">ID: ${c.id}</span>`;
    li.onclick = () => {
      championNameInput.value = c.name;
      championSuggestionsEl.style.display = "none";
    };
    championSuggestionsEl.appendChild(li);
  });
  championSuggestionsEl.style.display = "block";
}

async function handleChampionInput() {
  const raw = (championNameInput.value || "").trim();
  if (!raw) {
    championSuggestionsEl.style.display = "none";
    return;
  }
  await loadChampionData();
  const norm = normalizeChampionKey(raw);
  const filtered = championList
    .filter((c) => normalizeChampionKey(c.name).startsWith(norm))
    .slice(0, 12);
  showChampionSuggestions(filtered);
}

async function resolveChampion(input) {
  const raw = (input || "").trim();
  if (!raw) throw new Error("Champion eingeben.");
  await loadChampionData();
  const norm = normalizeChampionKey(raw);
  const found = championMap[norm];
  if (!found) throw new Error(`Champion '${raw}' nicht gefunden.`);
  return found;
}

// ======================
//   API-Helfer
// ======================

// GET /api/account?name=NAME#TAG&region=...
async function fetchAccountInfo(acc) {
  const url = `${API_BASE}/api/account?name=${encodeURIComponent(
    acc.name
  )}&region=${encodeURIComponent(acc.region)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ======================
//   CHAMPION-AGGREGATION
// ======================
function renderAggregateResult(data) {
  aggregateResultEl.innerHTML = "";
  if (!data) return;

  const wrap = document.createElement("div");
  wrap.innerHTML = `<strong>${data.championName}</strong>: ${data.totalPoints.toLocaleString(
    "de-CH"
  )} Gesamtpunkte`;

  const table = document.createElement("table");
  const head = document.createElement("thead");
  head.innerHTML = `
    <tr>
      <th>Account</th>
      <th>Region</th>
      <th>Punkte</th>
      <th>Level</th>
    </tr>`;
  table.appendChild(head);

  const body = document.createElement("tbody");
  (data.accounts || [])
    .slice()
    .sort((a, b) => (b.points || 0) - (a.points || 0))
    .forEach((r) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${r.name || "-"}</td>
        <td>${(r.region || "-").toUpperCase()}</td>
        <td>${(r.points || 0).toLocaleString("de-CH")}</td>
        <td>${r.level != null ? r.level : "-"}</td>
      `;
      body.appendChild(row);
    });

  table.appendChild(body);
  wrap.appendChild(table);
  aggregateResultEl.appendChild(wrap);
}

async function handleAggregate() {
  const accounts = getAccounts();
  const champRaw = (championNameInput.value || "").trim();

  if (!champRaw) {
    aggregateStatusEl.textContent = "Champion eingeben.";
    return;
  }
  if (!accounts.length) {
    aggregateStatusEl.textContent = "Keine Accounts im Profil.";
    return;
  }

  aggregateBtn.disabled = true;
  addAccountBtn.disabled = true;
  aggregateStatusEl.textContent = "Lade…";
  aggregateResultEl.innerHTML = "";

  try {
    const champ = await resolveChampion(champRaw);

    const accountInfos = [];
    for (const a of accounts) {
      const info = await fetchAccountInfo(a);
      if (info && info.gameName && info.tagLine) {
        accountInfos.push({
          name: `${info.gameName}#${info.tagLine}`,
          region: a.region,
        });
      } else {
        accountInfos.push({ name: a.name, region: a.region });
      }
    }

    const res = await fetch(`${API_BASE}/api/mastery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        championId: champ.id,
        championName: champ.name,
        accounts: accountInfos,
      }),
    });

    if (!res.ok) throw new Error(`Fehler bei API (${res.status})`);
    const data = await res.json();
    aggregateStatusEl.textContent = "Daten geladen.";
    renderAggregateResult(data);
  } catch (e) {
    aggregateStatusEl.textContent = e.message || "Fehler.";
  } finally {
    aggregateBtn.disabled = false;
    addAccountBtn.disabled = false;
  }
}

// ======================
//   OVERALL / OPUS
// ======================
function renderOverallResult(data) {
  overallResultEl.innerHTML = "";
  if (!data || !Array.isArray(data.champions) || !data.champions.length) {
    overallResultEl.textContent = "Keine Daten.";
    return;
  }

  const champs = data.champions;

  const top = champs[0];
  const opusCard = document.createElement("div");
  opusCard.className = "opus-card";

  const name =
    (top.championId != null && championById[top.championId]?.name) ||
    `ID ${top.championId}`;

  opusCard.innerHTML = `
    <div class="opus-header-row">
      <div class="opus-label">Dein OPUS</div>
      <div class="opus-points">${(top.totalPoints || 0).toLocaleString(
        "de-CH"
      )} Punkte</div>
    </div>
    <div class="opus-name">${name}</div>
    <div class="opus-subtitle">
      Höchste Gesamt-Mastery über alle Accounts in diesem Profil.
    </div>
  `;
  overallResultEl.appendChild(opusCard);

  const table = document.createElement("table");
  const head = document.createElement("thead");
  head.innerHTML = `<tr><th>#</th><th>Champion</th><th>Punkte</th></tr>`;
  table.appendChild(head);

  const body = document.createElement("tbody");
  champs.forEach((c, i) => {
    const cname =
      (c.championId != null && championById[c.championId]?.name) ||
      `ID ${c.championId}`;
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${i + 1}</td>
      <td>${cname}${i === 0 ? " <span class='tag-opus'>OPUS</span>" : ""}</td>
      <td>${(c.totalPoints || 0).toLocaleString("de-CH")}</td>
    `;
    body.appendChild(row);
  });

  table.appendChild(body);
  overallResultEl.appendChild(table);
}

async function handleOverallAggregate() {
  const accounts = getAccounts();
  if (!accounts.length) {
    overallStatusEl.textContent = "Keine Accounts im Profil.";
    return;
  }

  overallBtn.disabled = true;
  addAccountBtn.disabled = true;
  overallStatusEl.textContent = "Lade…";
  overallResultEl.innerHTML = "";

  try {
    await loadChampionData();

    const accountInfos = [];
    for (const a of accounts) {
      const info = await fetchAccountInfo(a);
      if (info && info.gameName && info.tagLine) {
        accountInfos.push({
          name: `${info.gameName}#${info.tagLine}`,
          region: a.region,
        });
      } else {
        accountInfos.push({ name: a.name, region: a.region });
      }
    }

    const res = await fetch(`${API_BASE}/api/mastery/overall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accounts: accountInfos }),
    });

    if (!res.ok) throw new Error(`Fehler bei API (${res.status})`);
    const data = await res.json();
    overallStatusEl.textContent = "Gesamtübersicht geladen.";
    renderOverallResult(data);
  } catch (e) {
    overallStatusEl.textContent = e.message || "Fehler.";
  } finally {
    overallBtn.disabled = false;
    addAccountBtn.disabled = false;
  }
}

// ======================
//   SPIELZEIT (EINFACHER MODE)
// ======================
function renderPlaytimeResult(data) {
  playtimeResultEl.innerHTML = "";
  if (!data || !Array.isArray(data.accounts) || !data.accounts.length) {
    playtimeResultEl.textContent = "Keine Daten.";
    return;
  }

  const totalHours = data.totalHours != null ? data.totalHours : 0;
  let totalGames = 0;
  if (data.totalGames != null) {
    totalGames = data.totalGames;
  } else if (data.totalMatches != null) {
    totalGames = data.totalMatches;
  }

  const summary = document.createElement("p");
  summary.className = "small";
  summary.textContent =
    `Geschätzte Spielzeit: ${totalHours.toLocaleString("de-CH")} ` +
    `Stunden (${totalGames.toLocaleString("de-CH")} Spiele).`;
  playtimeResultEl.appendChild(summary);

  const table = document.createElement("table");
  const head = document.createElement("thead");
  head.innerHTML = `
    <tr>
      <th>Account</th>
      <th>Region</th>
      <th>Spiele</th>
      <th>Stunden (geschätzt)</th>
      <th>Quelle</th>
      <th>Level</th>
    </tr>
  `;
  table.appendChild(head);

  const body = document.createElement("tbody");
  data.accounts.forEach((a) => {
    const games = a.totalGames != null ? a.totalGames : (a.matches || 0);
    const hours =
      a.estimatedHours != null ? a.estimatedHours : (a.hours || 0);

    let source = a.estimationSource || (a.error ? "error" : "matches");
    let sourceLabel;

    switch (source) {
      case "matches":
        sourceLabel = "Matches";
        break;
      case "level_boost":
        sourceLabel = "Level + Matches";
        break;
      case "level_only":
        sourceLabel = "Level";
        break;
      case "mock":
        sourceLabel = "Mock-Daten";
        break;
      case "error":
        sourceLabel = a.error ? "Fehler (API)" : "Fehler";
        break;
      default:
        sourceLabel = source || "-";
    }

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${a.name}</td>
      <td>${(a.region || "-").toUpperCase()}</td>
      <td>${games.toLocaleString("de-CH")}</td>
      <td>${hours.toLocaleString("de-CH")}</td>
      <td>${sourceLabel}</td>
      <td>${a.level != null ? a.level : "-"}</td>
    `;
    body.appendChild(row);
  });

  table.appendChild(body);
  playtimeResultEl.appendChild(table);
}

async function handlePlaytimeProfile() {
  const accounts = getAccounts();
  if (!accounts.length) {
    playtimeStatusEl.textContent = "Keine Accounts im Profil.";
    return;
  }

  playtimeBtn.disabled = true;
  addAccountBtn.disabled = true;
  playtimeStatusEl.textContent = "Lade…";
  playtimeResultEl.innerHTML = "";

  try {
    const accountInfos = [];
    for (const a of accounts) {
      const info = await fetchAccountInfo(a);
      if (info && info.gameName && info.tagLine) {
        accountInfos.push({
          name: `${info.gameName}#${info.tagLine}`,
          region: a.region,
        });
      } else {
        accountInfos.push({ name: a.name, region: a.region });
      }
    }

    const res = await fetch(`${API_BASE}/api/playtime/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accounts: accountInfos }),
    });

    if (!res.ok) {
      throw new Error(`Fehler bei API (${res.status})`);
    }

    const data = await res.json();

    if (data.totalMatches != null && data.totalGames == null) {
      data.totalGames = data.totalMatches;
    }

    playtimeStatusEl.textContent = "Spielzeit geladen.";
    renderPlaytimeResult(data);
  } catch (e) {
    playtimeStatusEl.textContent = e.message || "Fehler.";
  } finally {
    playtimeBtn.disabled = false;
    addAccountBtn.disabled = false;
  }
}

// ======================
//   INIT-EVENTS
// ======================
if (profileSelect) {
  profileSelect.addEventListener("change", (e) => {
    switchProfile(e.target.value);
  });
}

if (loadDefaultsBtn) {
  loadDefaultsBtn.addEventListener("click", handleLoadDefaultAccounts);
}

if (addProfileBtn) {
  addProfileBtn.addEventListener("click", createProfile);
}

if (addAccountBtn) {
  addAccountBtn.addEventListener("click", addAccount);
}

if (accountNameInput) {
  accountNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addAccount();
    }
  });
}

if (toggleAccountsBtn && accountListEl) {
  toggleAccountsBtn.addEventListener("click", () => {
    accountsVisible = !accountsVisible;
    accountListEl.style.display = accountsVisible ? "block" : "none";
    toggleAccountsBtn.textContent = accountsVisible
      ? "Accounts einklappen"
      : "Accounts ausklappen";
  });
}

if (championNameInput) {
  championNameInput.addEventListener("input", handleChampionInput);
  championNameInput.addEventListener("blur", () => {
    setTimeout(() => {
      championSuggestionsEl.style.display = "none";
    }, 200);
  });
}

if (aggregateBtn) {
  aggregateBtn.addEventListener("click", handleAggregate);
}
if (overallBtn) {
  overallBtn.addEventListener("click", handleOverallAggregate);
}
if (playtimeBtn) {
  playtimeBtn.addEventListener("click", handlePlaytimeProfile);
}

// Teemo-Schnellbutton
if (teemoQuickBtn && championNameInput) {
  teemoQuickBtn.addEventListener("click", () => {
    championNameInput.value = "Teemo";
    championSuggestionsEl.style.display = "none";
  });
}

// ======================
//   INIT AUF PAGE-LOAD
// ======================

loadProfiles();

if (appLastUpdatedEl) {
  fetch(`${API_BASE}/api/app-meta`)
    .then((r) => r.json())
    .then((data) => {
      if (data.lastUpdatedIso) {
        const dt = new Date(data.lastUpdatedIso);
        appLastUpdatedEl.textContent = dt.toLocaleString("de-CH");
      }
    })
    .catch(() => {});
}
