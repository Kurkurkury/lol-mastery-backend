VERSIONS-SYSTEM – LEAGUE-APP

Hauptstruktur:
- _versions  → Archiv aller Vollversionen (v1, v2, v3, …)
- backend    → aktuelles Backend zum Arbeiten
- frontend   → aktuelles Frontend zum Arbeiten

Neue Version einspielen (z. B. v3):
1. In _versions neuen Ordner "v3" erstellen.
2. ZIP-Datei(en) nach _versions/v3 kopieren und dort entpacken.
3. Frontend-Teil aus v3 nach "frontend" kopieren (alte Dateien überschreiben).
4. Backend-Teil aus v3 nach "backend" kopieren (alte Dateien überschreiben).
5. App testen. Wenn Fehler → auf letzte funktionierende Version (v2, v1, …) zurückgehen.
