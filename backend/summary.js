// summary.js – erstellt eine einfache Text-Zusammenfassung der Daten
const fs = require('fs');
const path = require('path');
const store = require('./datastore');

function summarize() {
  const all = store.readAll();
  const totals = store.totalsByChampion();
  const accounts = [...new Set(all.map(a => a.account))];

  const lines = [];
  lines.push('--- League App Zusammenfassung ---');
  lines.push(`Gesamtanzahl Datensätze: ${all.length}`);
  lines.push(`Anzahl Accounts: ${accounts.length}`);
  lines.push('');

  lines.push('Top 5 Champions (nach Mastery):');
  for (const { champion, mastery } of totals.slice(0, 5)) {
    lines.push(` - ${champion}: ${mastery.toLocaleString('de-CH')}`);
  }

  lines.push('');
  lines.push('Accounts und ihre Champions:');
  for (const acc of accounts) {
    lines.push(`\n${acc}:`);
    const entries = store.listByAccount(acc);
    for (const e of entries) {
      lines.push(`   - ${e.champion}: ${e.mastery.toLocaleString('de-CH')}`);
    }
  }

  const out = path.join(__dirname, 'data', 'summary.txt');
  fs.writeFileSync(out, lines.join('\n'), 'utf8');
  console.log('Zusammenfassung erstellt:', out);
}

summarize();
