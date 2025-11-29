MASTER-README – League Mastery App (OnePlus + Render + Versioning)

npm run update-app


1. Deine Ordnerstruktur:
- _versions → alle gesicherten Gesamtversionen (v1, v2, v3…)
- backend → aktuelles Backend
- frontend → aktuelles Frontend

2. Wann muss ich was tun? – Schnellübersicht
- index.html/script.js geändert → Frontend aktualisieren, APK neu bauen
- server.js/API geändert → Backend aktualisieren, Render redeployen
- ZIP von ChatGPT → neue Version anlegen
- Auf OnePlus testen → Emulator oder neue APK
- Öffentlich testen → Render neu + APK neu (falls Frontend geändert)

3. Schritte bei index.html-Änderung:
1. frontend/public bearbeiten
2. Lokal testen
3. Android Studio Run ODER neue APK
4. Version in _versions sichern

4. Schritte bei Backend-Änderung:
1. backend bearbeiten
2. Lokal testen
3. Render redeploy
4. Version sichern

5. Neue ZIP einspielen:
1. _versions/vX erstellen
2. ZIP hinein + entpacken
3. Frontend → frontend kopieren
4. Backend → backend kopieren
5. testen

6. Neue APK bauen:
Android Studio → Build APK
Pfad: android/app/build/outputs/apk/debug/app-debug.apk
Auf Handy kopieren + installieren

7. Live auf Render testen:
Backend updaten → redeploy
App auf Handy starten

8. Mock/Live:
.env:
MOCK_MODE=true  → Offline
MOCK_MODE=false → Riot API

9. Entscheidungstabelle:
index.html geändert: Frontend ✔, Backend ❌, Render ❌, APK ✔, Version ✔
script.js geändert: Frontend ✔, Backend ❌, Render ❌, APK ✔, Version ✔
server.js geändert: Frontend ❌, Backend ✔, Render ✔, APK ❌, Version ✔
Profil geändert: Frontend ❌, Backend ✔, Render ✔, APK ❌, Version ✔
Android geändert: Frontend ❌, Backend ❌, Render ❌, APK ✔, Version ✔
Neue ZIP: Frontend ✔, Backend ✔, Render (nur Backend) ✔, APK (nur Frontend) ✔, Version ✔
