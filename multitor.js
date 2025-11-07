// multitor.js (CommonJS – mit BOM-Fix)
const fs = require("fs");
const path = require("path");

// ===== Einstellungen =====
const ACCOUNTS = [
  // "LifeForce666",
  // "niceguy#yeet",
  // "t1gumasushi.euwe",
  // "shawtyhunter#skt",
];
const DATA_DIR = path.join(__dirname, "data");
const EXCLUDE_FILES = new Set([
  "example.json",
  "template.json",
  "accounts.json",
  "status.json",
]);
// =========================

function parseArgs(argv) {
  const args = { files: [], dir: null };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--files") {
      i++;
      while (i < rest.length && !rest[i].startsWith("--")) {
        args.files.push(rest[i]);
        i++;
      }
      i--;
    } else if (a === "--dir") {
      args.dir = rest[i + 1];
      i++;
    }
  }
  return args;
}

// Entfernt UTF-8 BOM und sonstige unsichtbare Steuerzeichen am Anfang
function cleanJsonString(s) {
  return s.replace(/^\uFEFF/, "").replace(/^[\u0000-\u001F]+/, "").trim();
}

async function readJsonSafe(filePath) {
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    const cleaned = cleanJsonString(raw);
    return { ok: true, data: JSON.parse(cleaned) };
  } catch (err) {
    return { ok: false, error: err };
  }
}

function analyzeStructure(obj) {
  const issues = [];
  const championSet =
    obj?.championSet ?? obj?.champions ?? obj?.data ?? obj?.list ?? null;
  const masteryPoints =
    obj?.masteryPoints ??
    obj?.totalMastery ??
    obj?.points ??
    obj?.stats?.masteryPoints ??
    null;
  const updated = obj?.updated ?? obj?.lastUpdated ?? obj?.meta?.updated ?? null;

  let championCount = null;
  if (Array.isArray(championSet)) championCount = championSet.length;
  else if (championSet && typeof championSet === "object")
    championCount = Object.keys(championSet).length;

  let computedPoints = null;
  if (masteryPoints == null && championSet) {
    try {
      const vals = Array.isArray(championSet)
        ? championSet
        : Object.values(championSet);
      computedPoints = vals.reduce((s, c) => {
        const p = c?.points ?? c?.masteryPoints;
        return s + (typeof p === "number" ? p : 0);
      }, 0);
    } catch {}
  }

  if (!championSet)
    issues.push("Champion-Liste fehlt (championSet/champions/data).");
  if (updated == null) issues.push("Feld 'updated' (oder lastUpdated) fehlt.");
  if (masteryPoints == null && computedPoints == null)
    issues.push("Gesamt-Mastery-Punkte fehlen/unklar.");

  return {
    championCount,
    masteryPoints: masteryPoints ?? computedPoints ?? null,
    updated,
    issues,
  };
}

function printRow({ idx, label, ok, championCount, masteryPoints, updated, issues }) {
  const status = ok ? "OK " : "ERR";
  const pad = (s, n) => String(s ?? "").padEnd(n, " ");
  console.log(
    `${pad(idx, 3)} ${pad(status, 3)} ${pad(label, 28)}  ` +
    `Champs:${pad(championCount ?? "-", 5)}  ` +
    `Points:${pad(masteryPoints ?? "-", 8)}  ` +
    `Updated:${pad(updated ?? "-", 20)}` +
    (issues.length ? "  | " + issues.join(" ; ") : "")
  );
}

async function listJsonFiles(sourceDir) {
  const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".json"))
    .map((e) => path.join(sourceDir, e.name))
    .filter((p) => !EXCLUDE_FILES.has(path.basename(p)));
}

async function resolveTargets(cli) {
  if (cli.files.length)
    return cli.files.map((f) => (path.isAbsolute(f) ? f : path.join(__dirname, f)));
  if (ACCOUNTS.length)
    return ACCOUNTS.map((acc) => path.join(DATA_DIR, `${acc}.json`));
  const dir = cli.dir
    ? path.isAbsolute(cli.dir) ? cli.dir : path.join(__dirname, cli.dir)
    : DATA_DIR;
  return await listJsonFiles(dir);
}

async function main() {
  const cli = parseArgs(process.argv);
  const targets = await resolveTargets(cli);

  if (!targets.length) {
    console.log("Keine Ziel-Dateien gefunden. ACCOUNTS setzen, --files nutzen oder --dir (Standard: ./data).");
    process.exit(2);
  }

  console.log("=".repeat(88));
  console.log("multitor — Accounts/Dateien prüfen");
  console.log("=".repeat(88));
  console.log("Idx Stat Account/Datei                Champs:      Points:    Updated:            | Hinweise");
  console.log("-".repeat(88));

  let okCount = 0, errCount = 0;

  for (let i = 0; i < targets.length; i++) {
    const filePath = targets[i];
    const label = path.basename(filePath, ".json");
    const res = await readJsonSafe(filePath);

    if (!res.ok) {
      printRow({
        idx: i + 1,
        label,
        ok: false,
        championCount: null,
        masteryPoints: null,
        updated: null,
        issues: [`Lesefehler: ${res.error.message || res.error.code}`],
      });
      errCount++;
      continue;
    }

    const a = analyzeStructure(res.data);
    const ok = a.issues.length === 0;
    printRow({
      idx: i + 1,
      label,
      ok,
      championCount: a.championCount,
      masteryPoints: a.masteryPoints,
      updated: a.updated,
      issues: a.issues,
    });
    ok ? okCount++ : errCount++;
  }

  console.log("-".repeat(88));
  console.log(`Fertig. OK: ${okCount} | Fehler: ${errCount} | Gesamt: ${targets.length}`);
  if (errCount > 0) process.exitCode = 1;
}

main();
