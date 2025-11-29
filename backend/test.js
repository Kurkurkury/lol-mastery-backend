// test.js – Haupttestlauf für dein App-Projekt
// Liest und schreibt Daten (Accounts, Champions, Mastery-Werte)

const { setStatus, getStatus } = require('./status');
const path = require('path');
const store = require('./datastore');

function run() {
  console.log('--- Testlauf gestartet ---');

  // 1. Aktuellen Status auslesen
  const before = getStatus();
  console.log('Status vorher:', before.status);

  // 2. Status aktualisieren
  setStatus('running', { task: 'data-check' });
  console.log('Status nachher:', getStatus().status);

  // 3. Gesamte Mastery je Champion berechnen
  const totals = store.totalsByChampion();
  console.log('\nTop Champions (Mastery gesamt):');
  for (const { champion, mastery } of totals.slice(0, 10)) {
    console.log(` - ${champion}: ${mastery.toLocaleString('de-CH')}`);
  }

  // 4. Beispiel: neuen oder bestehenden Datensatz einfügen/aktualisieren
  const updated = store.upsert({
    account: 'Life Force666',
    champion: 'Zed',
    mastery: 32100,
  });
  console.log('\nDatensatz gespeichert/aktualisiert:', updated);

  // 5. Alle Einträge eines bestimmten Accounts anzeigen
  const byAcc = store.listByAccount('Life Force666');
  console.log(`\nEinträge für Life Force666:`);
  for (const entry of byAcc) {
    console.log(` - ${entry.champion}: ${entry.mastery.toLocaleString('de-CH')}`);
  }

  // 6. Quelle anzeigen
  console.log('\nDatenquelle:', path.join(__dirname, 'data', 'example.json'));

  console.log('--- Testlauf abgeschlossen ---');
}

// nur ausführen, wenn direkt gestartet
if (require.main === module) run();

module.exports = run;
