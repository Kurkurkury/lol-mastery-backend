// cli.js – einfache CLI für example.json (totals, list, add/set, get, remove)
const store = require('./datastore');

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    if (!a.startsWith('--')) continue;
    const [k, v] = a.split('=');
    args[k.replace(/^--/, '')] = v;
  }
  return args;
}

function help() {
  console.log(`
Befehle:
  node cli.js totals
  node cli.js list --account="ACCOUNT"
  node cli.js get --account="ACCOUNT" --champion="CHAMPION"
  node cli.js add --account="ACCOUNT" --champion="CHAMPION" --mastery=ZAHL
  node cli.js set --account="ACCOUNT" --champion="CHAMPION" --mastery=ZAHL
  node cli.js remove --account="ACCOUNT" --champion="CHAMPION"
`);
}

function printRecord(r) {
  if (!r) return console.log('Kein Eintrag gefunden.');
  console.log(`${r.account} | ${r.champion} | ${Number(r.mastery).toLocaleString('de-CH')} | ${r.updatedAt}`);
}

async function main() {
  const [cmdRaw, ...rest] = process.argv.slice(2);
  const cmd = (cmdRaw || '').startsWith('--') ? '' : (cmdRaw || '');
  const args = parseArgs();

  switch (cmd) {
    case 'totals': {
      const totals = store.totalsByChampion();
      console.log('Top Champions (gesamt):');
      for (const { champion, mastery } of totals) {
        console.log(` - ${champion}: ${mastery.toLocaleString('de-CH')}`);
      }
      break;
    }
    case 'list': {
      if (!args.account) return help();
      const rows = store.listByAccount(args.account);
      if (rows.length === 0) {
        console.log(`Keine Einträge für ${args.account}.`);
        break;
      }
      console.log(`Einträge für ${args.account}:`);
      for (const r of rows) {
        console.log(` - ${r.champion}: ${Number(r.mastery).toLocaleString('de-CH')} (updated ${r.updatedAt})`);
      }
      break;
    }
    case 'get': {
      if (!args.account || !args.champion) return help();
      printRecord(store.get(args.account, args.champion));
      break;
    }
    case 'add':
    case 'set': {
      if (!args.account || !args.champion || typeof args.mastery === 'undefined') return help();
      const rec = store.upsert({
        account: args.account,
        champion: args.champion,
        mastery: Number(args.mastery)
      });
      console.log('Gespeichert:');
      printRecord(rec);
      break;
    }
    case 'remove': {
      if (!args.account || !args.champion) return help();
      const ok = store.remove(args.account, args.champion);
      console.log(ok ? 'Eintrag gelöscht.' : 'Kein passender Eintrag zum Löschen gefunden.');
      break;
    }
    default:
      help();
  }
}

main();
