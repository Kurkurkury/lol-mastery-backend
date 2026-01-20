// coach.js – Akira Jungle Coach (Beta, Offline mit eigenen Audiofiles)
// Akira redet im Text-Log und spielt zufällige Audio-Clips aus /akira/*.mp3 ab.

(function () {
  const STORAGE_KEY_STATS = "akira_coach_stats_v1";
  const STORAGE_KEY_LAST_SESSION = "akira_coach_last_session_v1";

  // <<< HIER trägst du deine Audio-Dateien ein >>>
  const AKIRA_CLIPS = [
  "akira/1.mp3",
  "akira/2.mp3",
  "akira/3.mp3",
  "akira/4.mp3",
];


  /** @type {HTMLButtonElement|null} */
  const btnStart = document.getElementById("coach-start-game");
  /** @type {HTMLButtonElement|null} */
  const btnReset = document.getElementById("coach-reset");
  /** @type {HTMLInputElement|null} */
  const csInput = document.getElementById("cs-input");
  /** @type {HTMLButtonElement|null} */
  const btnCsEvaluate = document.getElementById("cs-evaluate");
  /** @type {HTMLElement|null} */
  const statusEl = document.getElementById("coach-status");

  // ====== STATE ======

  const coachState = {
    active: false,
    gameStartTs: null,
    firedMarkers: new Set(),
    tickTimer: null,
  };

  const stats = loadStats();

  // Zeitpunkte (in Minuten), an denen Akira automatisch spricht
  const timeMarkers = [1, 3, 5, 8, 10, 13, 16, 20, 25, 30];

  // ====== STORAGE ======

  function loadStats() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_STATS);
      if (!raw) {
        return {
          games: 0,
          wins: 0,
          losses: 0,
          avgCs10: 0,
          avgDrakes: 0,
          avgDeathsEarly: 0,
        };
      }
      const parsed = JSON.parse(raw);
      return {
        games: parsed.games || 0,
        wins: parsed.wins || 0,
        losses: parsed.losses || 0,
        avgCs10: parsed.avgCs10 || 0,
        avgDrakes: parsed.avgDrakes || 0,
        avgDeathsEarly: parsed.avgDeathsEarly || 0,
      };
    } catch {
      return {
        games: 0,
        wins: 0,
        losses: 0,
        avgCs10: 0,
        avgDrakes: 0,
        avgDeathsEarly: 0,
      };
    }
  }

  function saveStats() {
    try {
      localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(stats));
    } catch {
      // ignore
    }
  }

  function saveLastSession(session) {
    try {
      localStorage.setItem(STORAGE_KEY_LAST_SESSION, JSON.stringify(session));
    } catch {
      // ignore
    }
  }

  // ====== UTILS ======

  function appendStatus(text) {
    if (!statusEl) {
      console.log("[Akira]", text);
      return;
    }
    const line = document.createElement("div");
    line.textContent = text;
    statusEl.appendChild(line);
    statusEl.scrollTop = statusEl.scrollHeight;
  }

  function setStatus(text) {
    if (!statusEl) {
      console.log("[Akira status]", text);
      return;
    }
    statusEl.textContent = "";
    appendStatus(text);
  }

  // spielt einen zufälligen Akira-Clip aus AKIRA_CLIPS
  function playAkiraClip() {
    if (!AKIRA_CLIPS || AKIRA_CLIPS.length === 0) return;
    const index = Math.floor(Math.random() * AKIRA_CLIPS.length);
    const src = AKIRA_CLIPS[index];
    try {
      const audio = new Audio(src);
      audio.volume = 1.0;
      audio.play().catch(() => {
        // z.B. Autoplay blockiert – dann halt nur Text
      });
    } catch (e) {
      console.log("[Akira audio error]", e.message);
    }
  }

  // frühere speak()-Funktion: jetzt nur noch Audio-Trigger
  function speak() {
    playAkiraClip();
  }

  function formatMinutesSec(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // ====== AKIRA PERSONA ======

  function akiraIntroLine() {
    if (stats.games === 0) {
      return "Gut. Erstes offizielles Coaching mit mir. Du spielst, ich bewerte. Versuch, mich nicht zu enttäuschen.";
    }

    if (stats.avgCs10 < 60) {
      return `Wir sind wieder da. Deine durchschnittliche CS bei 10 Minuten liegt bei ${Math.round(
        stats.avgCs10
      )}. Das ist mein persönliches Projekt heute.`;
    }

    if (stats.avgDeathsEarly >= 3) {
      return `Schon wieder ein neues Game? Mit deinem Schnitt von ${stats.avgDeathsEarly.toFixed(
        1
      )} Toden vor 15 Minuten habe ich gut zu tun.`;
    }

    return "Neues Game, neue Gelegenheit, es besser zu machen. Oder mich noch mehr zu triggern. Deine Wahl.";
  }

  function akiraLineForMinute(minute) {
    const base = [];

    if (minute <= 2) {
      if (stats.games === 0) {
        base.push(
          "Minute eins. Atme, fokussiere dich. Wenn du schon hier Mist baust, wird das anstrengend."
        );
      } else if (stats.avgDeathsEarly > 2.5) {
        base.push(
          "Wir sind knapp nach Start und ich erwarte nur eins von dir: nicht direkt im Level-1-Fight inten. Das solltest du schaffen, oder?"
        );
      } else {
        base.push(
          "Frühes Game. Dein Clear bestimmt den Rest. Keine unnötigen Umwege. Camps, nicht spazieren."
        );
      }
    } else if (minute === 3) {
      if (stats.avgCs10 < 55) {
        base.push(
          "Minute drei. Wenn du immer noch im Jungle rumtrödelst und keinen Gank vorbereitet hast, wundere dich nicht über deine CS."
        );
      } else {
        base.push(
          "Minute drei. Spätestens jetzt solltest du Druck aufgebaut haben. Scuttle contested, Lane angepingt. Wenn du nur afk farmst, bist du ein glorifizierter Minion."
        );
      }
    } else if (minute === 5) {
      if (stats.avgDrakes < 1) {
        base.push(
          "Minute fünf. Erster Drache ist nicht Deko. Wenn du ihn wieder abgibst, schreibe ich mental deinen Namen auf die Bronze-Jungler-Liste."
        );
      } else {
        base.push(
          "Minute fünf. Denk an Vision um den Drachen. Du bist Jungler, kein Tourist."
        );
      }
    } else if (minute === 8) {
      base.push(
        "Minute acht. Wenn dein Team schon brennt, frag dich, wo du warst. Map anschauen, nicht nur Camps."
      );
    } else if (minute === 10) {
      if (stats.avgCs10 === 0) {
        base.push(
          "Minute zehn. Merke dir jetzt deine CS. Nach dem Game trägst du sie ein, damit ich schwarz auf weiß sehe, womit ich arbeiten muss."
        );
      } else {
        base.push(
          `Minute zehn. Dein bisheriger Schnitt liegt bei ${Math.round(
            stats.avgCs10
          )} CS. Heute will ich mehr sehen. Also hör auf, Zeit zu verschwenden.`
        );
      }
    } else if (minute === 13) {
      if (stats.avgDeathsEarly >= 3) {
        base.push(
          "Wir sind Richtung Minute 13. Wenn du schon mehrfach tot warst, hör auf, Solo-Play zu erzwingen. Du bist kein Anime-Protagonist."
        );
      } else {
        base.push(
          "Minute dreizehn. Übergang ins Midgame. Entscheide endlich, ob du für Objectives spielst oder weiter random gankst."
        );
      }
    } else if (minute === 16) {
      base.push(
        "Minute sechzehn. Spätestens jetzt sollte dein Team spüren, dass du Jungle spielst. Wenn nicht, bist du nur ein weiterer grauer Bildschirm im Team-Tab."
      );
    } else if (minute === 20) {
      base.push(
        "Minute zwanzig. Baron-Zeit. Wenn du jetzt ohne Vision und ohne Plan rumläufst, machst du es den Gegnern zu leicht."
      );
    } else if (minute === 25) {
      base.push(
        "Minute fünfundzwanzig. Wenn ihr noch im Game seid, bist du entweder der einzige Grund oder einer der Gründe, warum es so schwer ist. Sei der erste."
      );
    } else if (minute === 30) {
      base.push(
        "Minute dreißig. Wenn du immer noch keine klare Win-Con im Kopf hast, brauchst du mehr als nur diese Stimme. Aber wir fangen hier an."
      );
    } else {
      base.push(
        `Minute ${minute}. Spielst du, um zu gewinnen, oder einfach nur, um deine Zeit zu füllen? Entscheide dich.`
      );
    }

    return base.join(" ");
  }

  function akiraPostGameReview(session) {
    const { cs10, drakes, deathsEarly, win } = session;

    const lines = [];

    if (win) {
      lines.push(
        "Win also. Gut. Sieg heißt nicht automatisch, dass du gut gespielt hast – aber es ist ein Anfang."
      );
    } else {
      lines.push(
        "Lose. Überraschung. Lass uns schauen, ob du wenigstens etwas daraus gelernt hast."
      );
    }

    // CS Bewertung
    if (cs10 < 50) {
      lines.push(
        `CS @10: ${cs10}. Das ist zu wenig. Du bist Jungler, kein Zuschauer. Du brauchst mehr Gold als deine Laner, nicht weniger.`
      );
    } else if (cs10 < 70) {
      lines.push(
        `CS @10: ${cs10}. Solide, aber ausbaufähig. Mit ordentlichem Pathing sind 70+ drin, und das weißt du.`
      );
    } else {
      lines.push(
        `CS @10: ${cs10}. Gut. Genau so will ich das sehen. Jetzt bitte nicht durch dumme Tode alles wieder wegwerfen.`
      );
    }

    // Drakes
    if (drakes === 0) {
      lines.push(
        "Keine Drakes für dein Team. Dann hast du entweder kein Macro gespielt oder du warst nie da, wenn es wichtig wurde."
      );
    } else if (drakes === 1) {
      lines.push(
        "Ein Drache. Okay. Aber 'okay' ist nicht der Anspruch. Du bist der, der die Objectives plant, nicht der, der zuguckt."
      );
    } else {
      lines.push(
        `${drakes} Drakes. Gut. Das ist das Minimum, wenn du ernsthaft gewinnen willst. Mach das zur Gewohnheit.`
      );
    }

    // Deaths early
    if (deathsEarly >= 4) {
      lines.push(
        `${deathsEarly} Tode vor 15 Minuten. Das ist kein Aggro-Play, das ist Sabotage. Lerne, wann du einfach loslassen musst.`
      );
    } else if (deathsEarly >= 2) {
      lines.push(
        `${deathsEarly} Tode vor 15. Aggressiv ist okay, aber ohne Plan bist du nur Free Gold.`
      );
    } else if (deathsEarly === 1) {
      lines.push(
        "Nur ein früher Tod. Gut. So kann man spielen. Jetzt noch bessere Entscheidungen und du wirst stabil."
      );
    } else {
      lines.push(
        "Keine frühen Tode. Genau so will ich das. Jetzt nutz den Vorteil, statt ihn zu wegzuwerfen."
      );
    }

    const grade = computeGrade(cs10, drakes, deathsEarly, win);
    if (grade === "S") {
      lines.push(
        "Insgesamt: glatte S-Performance. Und nein, das heißt nicht, dass du fertig bist. Das heißt nur, dass du das Niveau halten musst."
      );
    } else if (grade === "A") {
      lines.push(
        "Insgesamt: A. Gut, aber nicht perfekt. Und 'gut' langweilt mich. Wir zielen auf S, nicht auf bequem."
      );
    } else if (grade === "B") {
      lines.push(
        "Insgesamt: B. Mittelmäßigkeit mit Tendenz nach oben. Du kannst besser, sonst wärst du nicht hier."
      );
    } else if (grade === "C") {
      lines.push(
        "Insgesamt: C. Das ist die Zone, wo man sich einredet, es sei 'okay'. Nein. Es ist nicht okay."
      );
    } else {
      lines.push(
        "Insgesamt: D. Wenn du so weitermachst, brauchen wir viele Sessions. Zum Glück habe ich Geduld. Du nicht."
      );
    }

    return lines.join(" ");
  }

  function computeGrade(cs10, drakes, deathsEarly, win) {
    let score = 0;

    if (cs10 >= 70) score += 2;
    else if (cs10 >= 55) score += 1;
    else if (cs10 < 50) score -= 1;

    if (drakes >= 2) score += 2;
    else if (drakes === 1) score += 1;
    else score -= 1;

    if (deathsEarly === 0) score += 2;
    else if (deathsEarly === 1) score += 1;
    else if (deathsEarly >= 4) score -= 2;
    else score -= 1;

    if (win) score += 1;
    else score -= 1;

    if (score >= 5) return "S";
    if (score >= 3) return "A";
    if (score >= 1) return "B";
    if (score >= -1) return "C";
    return "D";
  }

  // ====== SESSION-HANDLING ======

  function startSession() {
    if (coachState.active) {
      appendStatus("Akira: Die Session läuft bereits. Fokus aufs Game.");
      return;
    }

    coachState.active = true;
    coachState.gameStartTs = Date.now();
    coachState.firedMarkers = new Set();

    if (coachState.tickTimer) {
      clearInterval(coachState.tickTimer);
    }
    coachState.tickTimer = setInterval(onTick, 2000);

    const intro = akiraIntroLine();
    setStatus("Akira aktiviert.\n");
    appendStatus(intro);
    speak(); // spielt einen deiner Clips ab
  }

  function endSession(fullReset = false) {
    if (coachState.tickTimer) {
      clearInterval(coachState.tickTimer);
      coachState.tickTimer = null;
    }
    coachState.active = false;
    coachState.gameStartTs = null;
    coachState.firedMarkers = new Set();

    if (fullReset) {
      setStatus("Session beendet. Wenn du willst, kannst du direkt die nächste starten.");
    } else {
      appendStatus(
        "Session beendet. Trag jetzt deine CS @10 ein und klick auf 'Bewerten'."
      );
    }
  }

  function onTick() {
    if (!coachState.active || !coachState.gameStartTs) return;

    const now = Date.now();
    const elapsedSec = (now - coachState.gameStartTs) / 1000;
    const minute = Math.floor(elapsedSec / 60);

    for (const m of timeMarkers) {
      if (minute >= m && !coachState.firedMarkers.has(m)) {
        coachState.firedMarkers.add(m);
        const line = akiraLineForMinute(m);
        appendStatus(`[${formatMinutesSec(m * 60)}] ${line}`);
        speak(); // wieder nur Clip
      }
    }
  }

  // ====== POST-GAME AUSWERTUNG ======

  function handleEvaluateCs() {
    if (!csInput) {
      appendStatus(
        "CS-Feld nicht gefunden. Trag deine CS @10 manuell irgendwo ein, dann reden wir."
      );
      return;
    }

    const raw = (csInput.value || "").trim();
    const cs10 = Number(raw);
    if (!raw || Number.isNaN(cs10) || cs10 < 0) {
      appendStatus("Akira: Trag eine gültige Zahl für deine CS @10 ein.");
      return;
    }

    let winStr = window.prompt("Win oder Lose? (w/l)", "w");
    let drakesStr = window.prompt(
      "Wie viele Drakes hatte DEIN Team?",
      "1"
    );
    let deathsStr = window.prompt(
      "Wie viele Tode hattest du vor 15 Minuten?",
      "2"
    );

    winStr = (winStr || "").toLowerCase();
    const win = winStr.startsWith("w");

    const drakes = Math.max(0, Number(drakesStr || "0") || 0);
    const deathsEarly = Math.max(0, Number(deathsStr || "0") || 0);

    const session = {
      timestamp: new Date().toISOString(),
      cs10,
      drakes,
      deathsEarly,
      win,
    };

    const oldGames = stats.games;
    stats.games += 1;
    if (win) stats.wins += 1;
    else stats.losses += 1;

    stats.avgCs10 =
      oldGames === 0
        ? cs10
        : (stats.avgCs10 * oldGames + cs10) / stats.games;

    stats.avgDrakes =
      oldGames === 0
        ? drakes
        : (stats.avgDrakes * oldGames + drakes) / stats.games;

    stats.avgDeathsEarly =
      oldGames === 0
        ? deathsEarly
        : (stats.avgDeathsEarly * oldGames + deathsEarly) / stats.games;

    saveStats();
    saveLastSession(session);

    const review = akiraPostGameReview(session);
    appendStatus("");
    appendStatus("Nachbesprechung:");
    appendStatus(review);
    speak(); // Abschluss-Clip

    endSession(true);
    csInput.value = "";
    showStatsSummary();
  }

  // ====== STATS ANZEIGE ======

  function showStatsSummary() {
    const lines = [];
    lines.push(
      `Bisherige Games: ${stats.games} (Wins: ${stats.wins}, Losses: ${stats.losses})`
    );
    if (stats.games > 0) {
      lines.push(
        `Ø CS @10: ${Math.round(stats.avgCs10)} | Ø Drakes: ${stats.avgDrakes.toFixed(
          2
        )} | Ø frühe Tode: ${stats.avgDeathsEarly.toFixed(2)}`
      );
    } else {
      lines.push(
        "Noch keine gespeicherten Games. Bedeutet: ich habe noch keine Grundlage, dich wirklich fertigzumachen."
      );
    }

    appendStatus("");
    lines.forEach((l) => appendStatus(l));
  }

  // ====== INIT ======

  function init() {
    console.log("[Akira] init gestartet");

    if (!btnStart) {
      console.log("[Akira] Button coach-start-game nicht gefunden.");
    }
    if (!statusEl) {
      console.log("[Akira] coach-status nicht gefunden – ich logge nur in die Konsole.");
    }

    setStatus("Akira bereit. Starte ein Game und klick auf 'Game starten'.");

    showStatsSummary();

    if (btnStart) {
      btnStart.addEventListener("click", () => {
        startSession();
      });
    }

    if (btnReset) {
      btnReset.addEventListener("click", () => {
        endSession(true);
      });
    }

    if (btnCsEvaluate) {
      btnCsEvaluate.addEventListener("click", handleEvaluateCs);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
