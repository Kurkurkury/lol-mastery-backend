// coach.js
// Einfaches Grundgerüst für deinen Jungle-Coach mit Voice Output.
// Keine Verbindung zu LoL, nur Timer + manuelle Eingaben.

class JungleCoach {
  constructor(statusEl) {
    this.statusEl = statusEl;
    this.timers = [];
    this.gameStart = null;

    // Objective-Einstellungen (Sekunden)
    this.objectives = {
      dragon: {
        key: "dragon",
        name: "Drache",
        // ab Minute 5 alle 5 Minuten (Standard-Respawn; kannst du anpassen)
        respawnSeconds: 300,
        preWarnSeconds: 60
      },
      herald: {
        key: "herald",
        name: "Herold",
        respawnSeconds: 360, // 6 Minuten
        preWarnSeconds: 60
      },
      baron: {
        key: "baron",
        name: "Baron",
        respawnSeconds: 360, // 6 Minuten
        preWarnSeconds: 60
      }
    };
  }

  // ======================
  //  Text-Ausgabe & Stimme
  // ======================
  setStatus(message) {
    if (this.statusEl) {
      this.statusEl.textContent = message || "";
    }
  }

  speak(text) {
    // Falls keine SpeechSynthesis vorhanden ist
    if (!("speechSynthesis" in window)) {
      console.warn("Text-to-Speech wird von diesem Browser nicht unterstützt.");
      this.setStatus(text);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "de-DE";
    // Du kannst mit diesen Werten experimentieren:
    utterance.rate = 1.0; // Sprechgeschwindigkeit
    utterance.pitch = 1.1; // Tonhöhe (minimal „femininer“)
    window.speechSynthesis.speak(utterance);

    this.setStatus(text);
  }

  // ======================
  //   Timer-Verwaltung
  // ======================
  clearAllTimers() {
    this.timers.forEach((id) => clearTimeout(id));
    this.timers = [];
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  startGame() {
    this.clearAllTimers();
    this.gameStart = Date.now();
    this.speak("Game gestartet. Bitte nicht wieder drei Minuten AFK in der Base stehen, ja?");
  }

  handleObjectiveTaken(objKey) {
    const objective = this.objectives[objKey];
    if (!objective) return;

    const now = Date.now();
    const spawnTime = now + objective.respawnSeconds * 1000;
    const preWarnTime = spawnTime - objective.preWarnSeconds * 1000;

    // Info sofort
    this.speak(
      `${objective.name} ist weg. Nächster Spawn in etwa ${Math.round(
        objective.respawnSeconds / 60
      )} Minuten.`
    );

    // Vorwarnung planen
    const warnDelay = preWarnTime - now;
    if (warnDelay > 0) {
      const warnId = setTimeout(() => {
        this.speak(
          `${objective.name} ist in ${objective.preWarnSeconds} Sekunden da. Bitte diesmal nicht wieder zu spät kommen, okay?`
        );
      }, warnDelay);
      this.timers.push(warnId);
    }

    // Optional: zusätzliche Erinnerung genau beim Spawn
    const spawnDelay = spawnTime - now;
    if (spawnDelay > 0) {
      const spawnId = setTimeout(() => {
        this.speak(
          `${objective.name} ist jetzt da. Wenn du gerade Gromp farmst, drehe dich bitte um.`
        );
      }, spawnDelay);
      this.timers.push(spawnId);
    }
  }

  scheduleCsCheck(minutes, targetCs) {
    const now = Date.now();
    const delay = minutes * 60 * 1000;

    const id = setTimeout(() => {
      this.speak(
        `CS-Check. Wir sind bei Minute ${minutes}. Ziel waren mindestens ${targetCs} Vasallen. Schau nach und trag deine Zahl ein.`
      );
    }, delay);

    this.timers.push(id);
    this.setStatus(
      `CS-Check in ${minutes} Minuten geplant. Ziel: ${targetCs} CS.`
    );
  }

  evaluateCs(csValue, minute, targetCs) {
    if (csValue == null || isNaN(csValue)) {
      this.setStatus("Bitte eine gültige CS-Zahl eingeben.");
      return;
    }

    const cs = Number(csValue);
    let text;

    if (cs >= targetCs) {
      text = `Okay, ${cs} CS in Minute ${minute}. Ausnahmsweise bin ich mal stolz auf dich. Weiter so.`;
    } else if (cs >= targetCs * 0.75) {
      text = `${cs} CS in Minute ${minute}. Geht klar, aber du kannst besser. Weniger spazieren, mehr last-hitten.`;
    } else {
      text = `${cs} CS in Minute ${minute}. Was machst du die ganze Zeit? Wardest du die Base? Bitte konzentrier dich ein bisschen.`;
    }

    this.speak(text);
  }

  resetAll() {
    this.clearAllTimers();
    this.gameStart = null;
    this.setStatus("Coach zurückgesetzt. Neues Game, neues Leid.");
  }
}

// ======================
//  DOM-Setup / Verkabeln
// ======================

document.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.getElementById("coach-status");
  const coach = new JungleCoach(statusEl);

  const btnStartGame = document.getElementById("coach-start-game");
  const btnReset = document.getElementById("coach-reset");
  const csInput = document.getElementById("cs-input");
  const csEvaluateBtn = document.getElementById("cs-evaluate");

  if (btnStartGame) {
    btnStartGame.addEventListener("click", () => {
      coach.startGame();
    });
  }

  if (btnReset) {
    btnReset.addEventListener("click", () => {
      coach.resetAll();
    });
  }

  // Objective-Buttons
  document.querySelectorAll("button[data-obj]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-obj");
      coach.handleObjectiveTaken(key);
    });
  });

  // CS-Timer-Buttons
  document.querySelectorAll("button[data-cs-timer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const minutes = Number(btn.getAttribute("data-cs-timer"));
      let target = 0;
      if (minutes === 10) target = 80;
      else if (minutes === 15) target = 120;
      else target = 8 * minutes; // grobe Faustregel, kannst du anpassen

      coach.scheduleCsCheck(minutes, target);
    });
  });

  // CS-Auswertung
  if (csEvaluateBtn) {
    csEvaluateBtn.addEventListener("click", () => {
      const value = csInput ? csInput.value : "";
      // Hier nehme ich einfach 10 min Ziel 80 an; später kannst du Auswahl machen
      coach.evaluateCs(value, 10, 80);
    });
  }
});
