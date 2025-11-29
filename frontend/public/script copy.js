// public/script.js

(function () {
  const API_BASE = "https://lol-mastery-backend-6jl7.onrender.com";

  const uaSpan = document.getElementById("ua");
  const apiBaseSpan = document.getElementById("apiBase");
  const logEl = document.getElementById("log");

  const debugCard = document.getElementById("debugCard");
  const toggleDebugBtn = document.getElementById("toggleDebugBtn");

  const accountNameInput = document.getElementById("accountName");
  const accountRegionSelect = document.getElementById("accountRegion");
  const addAccountBtn = document.getElementById("addAccountBtn");
  const accountListEl = document.getElementById("accountList");

  const championNameInput = document.getElementById("championName");
  const championSuggestionsEl = document.getElementById("championSuggestions");
  const aggregateBtn = document.getElementById("aggregateBtn");
  const aggregateStatusEl = document.getElementById("aggregateStatus");
  const aggregateResultEl = document.getElementById("aggregateResult");

  let accounts = [];

  // Debug Anzeige
  if (uaSpan) uaSpan.textContent = navigator.userAgent;
  if (apiBaseSpan) apiBaseSpan.textContent = API_BASE;

  function log(msg) {
    if (!logEl) return;
    const ts = new Date().toISOString();
    logEl.textContent = `[${ts}] ${msg}\n` + logEl.textContent;
    console.log(msg);
  }

  // Debug-Card Toggle
  if (toggleDebugBtn && debugCard) {
    debugCard.style.display = "none";
    toggleDebugBtn.textContent = "Debug anzeigen";

    toggleDebugBtn.addEventListener("click", () => {
      const visible = debugCard.style.display !== "none";
      debugCard.style.display = visible ? "none" : "block";
      toggleDebugBtn.textContent = visible ? "Debug anzeigen" : "Debug verstecken";
    });
  }

  // Account List Rendering
  function renderAccounts() {
    accountListEl.innerHTML = "";

    if (accounts.length === 0) {
      const li = document.createElement("li");
      li.textContent = "Noch keine Accounts hinzugefügt.";
      li.style.opacity = "0.7";
      accountListEl.appendChild(li);
      return;
    }

    accounts.forEach((acc, index) => {
      const li = document.createElement("li");

      const leftSpan = document.createElement("span");
      leftSpan.textContent = `${acc.name} `;
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = acc.region.toUpperCase();
      leftSpan.appendChild(pill);

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "X";
      removeBtn.className = "secondary";
      removeBtn.addEventListener("click", () => {
        accounts.splice(index, 1);
        renderAccounts();
      });

      li.appendChild(leftSpan);
      li.appendChild(removeBtn);
      accountListEl.appendChild(li);
    });
  }

  // Riot-ID unverändert übernehmen
  function normalizeSummonerName(raw) {
    if (!raw) return "";
    return raw.trim();
  }

  function addAccount() {
    const rawName = accountNameInput.value;
    const name = normalizeSummonerName(rawName);
    const region = (accountRegionSelect.value || "euw1").toLowerCase();

    if (!name) {
      log("Kein Account-Name eingegeben.");
      return;
    }

    const exists = accounts.find(
      (a) => a.name.toLowerCase() === name.toLowerCase() && a.region === region
    );
    if (exists) {
      log("Account existiert bereits.");
      accountNameInput.value = "";
      return;
    }

    accounts.push({ name, region });
    accountNameInput.value = "";
    renderAccounts();
    log(`Account hinzugefügt: ${name} (${region})`);
  }

  async function fetchAccountInfo(acc) {
    const url = `${API_BASE}/api/account?name=${encodeURIComponent(
      acc.name
    )}&region=${encodeURIComponent(acc.region)}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      log(`Account-Info geladen: ${acc.name} (${acc.region})`);
      return { ...acc, ...data };
    } catch (err) {
      log(`Fehler bei /api/account (${acc.name}): ${err.message}`);
      return null;
    }
  }

  // Champion Data
  let championMap = null;
  let championList = [];
  let championDataLoaded = false;

  function normalizeChampionKey(s) {
    return s.toLowerCase().replace(/['\.\s]/g, "");
  }

  async function loadChampionData() {
    if (championDataLoaded) return championMap;

    log("Lade Champion-Daten…");

    const versions = await fetch(
      "https://ddragon.leagueoflegends.com/api/versions.json"
    ).then((r) => r.json());
    const latest = versions[0];

    const champsJson = await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${latest}/data/en_US/champion.json`
    ).then((r) => r.json());

    const data = champsJson.data;
    const map = {};
    const list = [];

    for (const key in data) {
      const champ = data[key];
      const entry = {
        id: parseInt(champ.key),
        name: champ.name,
        rawId: champ.id,
      };
      const normName = normalizeChampionKey(champ.name);
      const normId = normalizeChampionKey(champ.id);

      map[normName] = entry;
      map[normId] = entry;

      list.push(entry);
    }

    championMap = map;
    championList = list;
    championDataLoaded = true;

    log("Champion-Daten geladen.");
    return map;
  }

  function hideChampionSuggestions() {
    championSuggestionsEl.style.display = "none";
    championSuggestionsEl.innerHTML = "";
  }

  function showChampionSuggestions(list) {
    if (!list.length) return hideChampionSuggestions();

    championSuggestionsEl.innerHTML = "";
    list.forEach((champ) => {
      const li = document.createElement("li");
      li.innerHTML = `${champ.name} <span class="champion-key">ID: ${champ.id}</span>`;
      li.addEventListener("click", () => {
        championNameInput.value = champ.name;
        hideChampionSuggestions();
      });
      championSuggestionsEl.appendChild(li);
    });

    championSuggestionsEl.style.display = "block";
  }

  async function handleChampionInput() {
    const raw = championNameInput.value.trim();
    if (!raw) return hideChampionSuggestions();

    await loadChampionData();
    const norm = normalizeChampionKey(raw);

    const filtered = championList
      .filter((c) => normalizeChampionKey(c.name).startsWith(norm))
      .slice(0, 12);

    showChampionSuggestions(filtered);
  }

  async function resolveChampion(input) {
    const raw = input.trim();
    const norm = normalizeChampionKey(raw);

    await loadChampionData();
    const found = championMap[norm];

    if (!found) throw new Error(`Champion '${raw}' nicht gefunden.`);
    return found;
  }

  function renderAggregateResult(data) {
    aggregateResultEl.innerHTML = "";
    if (!data) return;

    const wrapper = document.createElement("div");

    const title = document.createElement("div");
    title.innerHTML = `<strong>${data.championName}</strong>: Gesamtpunkte ${data.totalPoints.toLocaleString(
      "de-CH"
    )}`;
    wrapper.appendChild(title);

    const table = document.createElement("table");
    const head = document.createElement("thead");
    const tr = document.createElement("tr");
    ["Account", "Region", "Punkte", "Level"].forEach((h) => {
      const th = document.createElement("th");
      th.textContent = h;
      tr.appendChild(th);
    });
    head.appendChild(tr);
    table.appendChild(head);

    const body = document.createElement("tbody");
    data.accounts.forEach((r) => {
      const row = document.createElement("tr");

      const td1 = document.createElement("td");
      td1.textContent = r.name || "-";

      const td2 = document.createElement("td");
      td2.textContent = (r.region || "-").toUpperCase();

      const td3 = document.createElement("td");
      td3.textContent = (r.points || 0).toLocaleString("de-CH");

      const td4 = document.createElement("td");
      td4.textContent = r.level != null ? r.level : "-";

      row.appendChild(td1);
      row.appendChild(td2);
      row.appendChild(td3);
      row.appendChild(td4);

      body.appendChild(row);
    });

    table.appendChild(body);
    wrapper.appendChild(table);

    aggregateResultEl.appendChild(wrapper);
  }

  async function handleAggregate() {
    const champName = championNameInput.value.trim();

    if (!champName) {
      aggregateStatusEl.innerHTML =
        '<span class="error">Champion eingeben.</span>';
      return;
    }

    if (!accounts.length) {
      aggregateStatusEl.innerHTML =
        '<span class="error">Mindestens einen Account hinzufügen.</span>';
      return;
    }

    aggregateBtn.disabled = true;
    addAccountBtn.disabled = true;
    aggregateStatusEl.textContent = "Lade Daten…";
    aggregateResultEl.innerHTML = "";

    try {
      const champ = await resolveChampion(champName);
      const championId = champ.id;
      const championName = champ.name;

      log(`Starte Aggregation für ${championName} (ID ${championId})`);

 // Account PUUIDs holen
const accountInfos = [];
for (const acc of accounts) {
  const info = await fetchAccountInfo(acc);
  if (info) {
    accountInfos.push(info);
  } else {
    accountInfos.push({
      name: acc.name,
      region: acc.region,
    });
  }
}





      // Body korrekt erstellen
      const body = {
        championId,
        championName,
        accounts: accountInfos.map((info) => ({
          name:
            info && info.gameName && info.tagLine
              ? `${info.gameName}#${info.tagLine}`
              : info.name,
          region: info.region,
        })),
      };

      const res = await fetch(`${API_BASE}/mastery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      log("Mastery-Daten empfangen.");
      aggregateStatusEl.textContent = "Daten erfolgreich geladen.";
      renderAggregateResult(data);
    } catch (err) {
      log(`Fehler bei Aggregation: ${err.message}`);
      aggregateStatusEl.innerHTML = `<span class="error">${err.message}</span>`;
    } finally {
      aggregateBtn.disabled = false;
      addAccountBtn.disabled = false;
    }
  }

  // Events
  addAccountBtn.addEventListener("click", addAccount);
  accountNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addAccount();
    }
  });

  championNameInput.addEventListener("input", handleChampionInput);
  championNameInput.addEventListener("blur", () =>
    setTimeout(hideChampionSuggestions, 200)
  );

  aggregateBtn.addEventListener("click", handleAggregate);

  renderAccounts();
  log("Frontend geladen.");
})();
