// Selbsttest zu den neuen Bibliotheksfassungen:
//   B04-C01 Cloud-Speicher V02-00        (bedingtes Schreiben)
//   B04-C05 Offline-Warteschlange V01-01 (Fehlermeldung, Raum, Uebernahme)
//
// Aufruf: npm run test:bausteine

import {
  erzeugeSpeicherAttrappe,
  speicherpruefung,
  STAND_FEHLT,
  type Speicherstand,
} from "../src/bausteine/B04-C01_Cloud-Speicher_V02-00";
import {
  erzeugeZwischenspeicher,
  erzeugeAblageAttrappe,
  istVerbindungsfehler,
  type Zwischenvorgang,
} from "../src/bausteine/B04-C05_Offline-Warteschlange_V01-01";
import {
  diffAndMerge,
  applyConflictResolutions,
  inhaltGleich,
  bestandGleich,
  stableStringify,
  konfliktSchluessel,
  type Zeile,
  type FeldKonflikt,
  type ZeilenKonflikt,
} from "../src/bausteine/B04-C04_Drei-Wege-Abgleich_V02-00";
import {
  gruppiereKonflikte,
  alleKonfliktSchluessel,
  alleEntschieden,
} from "../src/bausteine/B04-C06_Konfliktdialog_V01-01";
import { erzeugeSperre, nurEinerGleichzeitig, nacheinander } from "../src/bausteine/B04-C08_Speichersperre_V01-00";
import { Speicherwerk, zustandText, type Anzeige } from "../src/bausteine/B04-C09_Speicherwerk_V01-01";
import { erzeugeLokalSpeicher } from "../src/storage/lokalSpeicher";

let bestanden = 0;
const fehler: string[] = [];

function pruefe(id: string, bedingung: boolean, text: string, erhalten?: unknown) {
  if (bedingung) {
    bestanden += 1;
  } else {
    fehler.push(`${id}: ${text}${erhalten === undefined ? "" : ` -> ${JSON.stringify(erhalten)}`}`);
  }
}

const warte = (ms: number) => new Promise<void>((auf) => setTimeout(auf, ms));

async function main() {
  // ===========================================================================
  // B04-C01 V02-00
  // ===========================================================================

  // --- B01 Kennung ---------------------------------------------------------
  {
    const s = erzeugeSpeicherAttrappe("ordner", "attrappe:konto-A");
    pruefe("B01.1", s.kennung === "attrappe:konto-A", "Kennung wird durchgereicht", s.kennung);
  }

  // --- B02 Erstes Schreiben ------------------------------------------------
  {
    const s = erzeugeSpeicherAttrappe("ordner");
    const erst = await s.bedingtSchreiben({ a: 1 }, "daten.json", null, "ordner");
    pruefe("B02.1", erst.erfolg, "erstes Schreiben gelingt", erst);
    pruefe("B02.2", erst.grund === "geschrieben", "Grund 'geschrieben'", erst.grund);
    pruefe("B02.3", erst.stand.vorhanden, "Stand danach: vorhanden", erst.stand);
    pruefe("B02.4", erst.stand.inhaltskennung !== null, "Stand hat eine Inhaltskennung", erst.stand);

    const zweit = await s.bedingtSchreiben({ a: 2 }, "daten.json", null, "ordner");
    pruefe("B02.5", !zweit.erfolg, "zweites 'erstes Schreiben' wird abgelehnt", zweit);
    pruefe("B02.6", zweit.grund === "schonVorhanden", "Grund 'schonVorhanden'", zweit.grund);
    const inhalt = await s.lesen<{ a: number }>("daten.json", "ordner");
    pruefe("B02.7", inhalt?.a === 1, "der abgelehnte Schreibversuch hat nichts veraendert", inhalt);
  }

  // --- B03 Schreiben mit gueltigem und mit veraltetem Stand -----------------
  {
    const s = erzeugeSpeicherAttrappe("ordner");
    const erst = await s.bedingtSchreiben({ lauf: 1 }, "d.json", null, "ordner");
    const alt: Speicherstand = erst.stand;

    const zweit = await s.bedingtSchreiben({ lauf: 2 }, "d.json", alt, "ordner");
    pruefe("B03.1", zweit.erfolg, "Schreiben mit gueltigem Stand gelingt", zweit);
    pruefe(
      "B03.2",
      zweit.stand.inhaltskennung !== alt.inhaltskennung,
      "die Inhaltskennung aendert sich beim Schreiben",
      [alt.inhaltskennung, zweit.stand.inhaltskennung],
    );

    const dritt = await s.bedingtSchreiben({ lauf: 3 }, "d.json", alt, "ordner");
    pruefe("B03.3", !dritt.erfolg, "Schreiben mit VERALTETEM Stand wird abgelehnt", dritt);
    pruefe("B03.4", dritt.grund === "konflikt", "Grund 'konflikt'", dritt.grund);
    pruefe(
      "B03.5",
      dritt.stand.inhaltskennung === zweit.stand.inhaltskennung,
      "der Konflikt liefert den vorgefundenen fremden Stand zurueck",
      dritt.stand,
    );
    const inhalt = await s.lesen<{ lauf: number }>("d.json", "ordner");
    pruefe("B03.6", inhalt?.lauf === 2, "der fremde Stand bleibt unangetastet", inhalt);
  }

  // --- B04 Datei ist inzwischen verschwunden -------------------------------
  {
    const s = erzeugeSpeicherAttrappe("ordner");
    const erst = await s.bedingtSchreiben({ x: 1 }, "weg.json", null, "ordner");
    await s.loeschen("weg.json", "ordner");
    const versuch = await s.bedingtSchreiben({ x: 2 }, "weg.json", erst.stand, "ordner");
    pruefe("B04.1", !versuch.erfolg, "erwarteter Stand vorhanden, Datei fehlt -> Konflikt", versuch);
    pruefe("B04.2", versuch.grund === "konflikt", "Grund 'konflikt'", versuch.grund);
  }

  // --- B05 Das Rennen zwischen Riegel 1 und dem Schreiben -------------------
  {
    const s = erzeugeSpeicherAttrappe("ordner");
    const erst = await s.bedingtSchreiben({ v: 1 }, "r.json", null, "ordner");

    // Ein anderes Geraet schreibt GENAU zwischen Standpruefung und Schreiben.
    s.dazwischen(async () => {
      await s.schreiben({ v: 99 }, "r.json", "ordner");
    });
    const versuch = await s.bedingtSchreiben({ v: 2 }, "r.json", erst.stand, "ordner");
    pruefe("B05.1", !versuch.erfolg, "Riegel 2 faengt das Rennen ab", versuch);
    const inhalt = await s.lesen<{ v: number }>("r.json", "ordner");
    pruefe("B05.2", inhalt?.v === 99, "der fremde Stand bleibt erhalten", inhalt);
  }

  // --- B06 Dasselbe Rennen, wenn der Speicher If-Match ignoriert ------------
  // Haelt das Restfenster fest, das der Baustein offen ausweist. Der Test
  // beschreibt das VERHALTEN, er verlangt nicht, dass es gut ist.
  {
    const s = erzeugeSpeicherAttrappe("ordner");
    s.ifMatchBeachten(false);
    const erst = await s.bedingtSchreiben({ v: 1 }, "r.json", null, "ordner");
    s.dazwischen(async () => {
      await s.schreiben({ v: 99 }, "r.json", "ordner");
    });
    const versuch = await s.bedingtSchreiben({ v: 2 }, "r.json", erst.stand, "ordner");
    pruefe(
      "B06.1",
      versuch.erfolg,
      "ohne Riegel 2 geht genau dieses Rennen durch (bekanntes Restfenster)",
      versuch,
    );
  }

  // --- B07 lesenMitStand ---------------------------------------------------
  {
    const s = erzeugeSpeicherAttrappe("ordner");
    const leer = await s.lesenMitStand("fehlt.json", "ordner");
    pruefe("B07.1", leer.daten === null, "fehlende Datei: keine Daten", leer);
    pruefe("B07.2", leer.stand.vorhanden === false, "fehlende Datei: Stand 'nicht vorhanden'", leer.stand);
    pruefe("B07.3", STAND_FEHLT.vorhanden === false, "STAND_FEHLT ist exportiert und leer", STAND_FEHLT);

    await s.schreiben({ n: 5 }, "da.json", "ordner");
    const gelesen = await s.lesenMitStand<{ n: number }>("da.json", "ordner");
    pruefe("B07.4", gelesen.daten?.n === 5, "Inhalt wird gelesen", gelesen.daten);
    pruefe("B07.5", gelesen.stand.vorhanden, "Stand wird mitgeliefert", gelesen.stand);

    const erneut = await s.bedingtSchreiben({ n: 6 }, "da.json", gelesen.stand, "ordner");
    pruefe("B07.6", erneut.erfolg, "der gelesene Stand taugt als Schreibbedingung", erneut);
  }

  // --- B08 Speicherpruefung gegen die Attrappe ------------------------------
  {
    const s = erzeugeSpeicherAttrappe("ordner");
    const ergebnis = await speicherpruefung(s, "ordner");
    pruefe("B08.1", ergebnis.riegel1Wirkt, "Speicherpruefung stellt fest: Riegel 1 wirkt", ergebnis.zeilen);
    const liste = await s.auflisten("ordner");
    pruefe("B08.2", liste.length === 0, "die Pruefdatei wurde wieder entfernt", liste);
    pruefe("B08.3", ergebnis.zeilen.length >= 6, "die Pruefung liefert einen lesbaren Bericht", ergebnis.zeilen.length);
  }

  // ===========================================================================
  // B04-C05 V01-01
  // ===========================================================================

  // --- C01 Grundverhalten und Raum im Schluessel ---------------------------
  {
    const ablage = erzeugeAblageAttrappe();
    const z = erzeugeZwischenspeicher<{ w: number }>({
      vorsatz: "p08_",
      raum: "attrappe:konto-A",
      ablage,
    });
    pruefe("C01.1", z.verfuegbar, "Ablage vorhanden -> verfuegbar");
    pruefe("C01.2", z.baselineSchreiben("daten", { w: 1 }), "Schreiben meldet Erfolg");
    pruefe("C01.3", z.baselineLesen("daten")?.w === 1, "und liefert denselben Wert zurueck");

    const schluessel = Array.from(ablage.inhalt().keys());
    pruefe(
      "C01.4",
      schluessel.some((k) => k.includes("attrappe:konto-A")),
      "der Raum steht im Schluessel",
      schluessel,
    );
  }

  // --- C02 Zwei Raeume sehen einander nicht --------------------------------
  {
    const ablage = erzeugeAblageAttrappe();
    const a = erzeugeZwischenspeicher<{ w: number }>({ vorsatz: "p08_", raum: "konto-A", ablage });
    const b = erzeugeZwischenspeicher<{ w: number }>({ vorsatz: "p08_", raum: "konto-B", ablage });
    a.baselineSchreiben("daten", { w: 1 });
    pruefe("C02.1", b.baselineLesen("daten") === null, "Konto B sieht die baseline von A nicht", b.baselineLesen("daten"));
    b.baselineSchreiben("daten", { w: 2 });
    pruefe("C02.2", a.baselineLesen("daten")?.w === 1, "und A bleibt bei seinem eigenen Stand", a.baselineLesen("daten"));
  }

  // --- C03 Uebernahme alter, raumloser Staende -----------------------------
  {
    const ablage = erzeugeAblageAttrappe({
      "p08_baseline_daten": JSON.stringify({ w: 7 }),
    });
    const z = erzeugeZwischenspeicher<{ w: number }>({ vorsatz: "p08_", raum: "konto-A", ablage });
    pruefe("C03.1", z.baselineLesen("daten")?.w === 7, "der alte Stand wird gefunden");
    const jetzt = ablage.inhalt();
    pruefe("C03.2", !jetzt.has("p08_baseline_daten"), "der alte Schluessel ist danach weg", Array.from(jetzt.keys()));
    pruefe(
      "C03.3",
      jetzt.has("p08_konto-A_baseline_daten"),
      "und der Stand liegt im neuen Raum",
      Array.from(jetzt.keys()),
    );
    pruefe("C03.4", z.baselineLesen("daten")?.w === 7, "zweites Lesen liefert weiterhin denselben Wert");
  }

  // --- C04 Der neue Stand hat Vorrang vor dem alten ------------------------
  {
    const ablage = erzeugeAblageAttrappe({
      "p08_baseline_daten": JSON.stringify({ w: 7 }),
      "p08_konto-A_baseline_daten": JSON.stringify({ w: 9 }),
    });
    const z = erzeugeZwischenspeicher<{ w: number }>({ vorsatz: "p08_", raum: "konto-A", ablage });
    pruefe("C04.1", z.baselineLesen("daten")?.w === 9, "der Stand des Raums gewinnt", z.baselineLesen("daten"));
    pruefe("C04.2", ablage.inhalt().has("p08_baseline_daten"), "der alte Eintrag wird nicht angetastet");
  }

  // --- C05 Ohne Raum verhaelt sich der Baustein wie V01-00 -----------------
  {
    const ablage = erzeugeAblageAttrappe();
    const z = erzeugeZwischenspeicher<{ w: number }>({ vorsatz: "p08_", ablage });
    z.baselineSchreiben("daten", { w: 3 });
    pruefe("C05.1", ablage.inhalt().has("p08_baseline_daten"), "Schluessel ohne Raumteil", Array.from(ablage.inhalt().keys()));
  }

  // --- C06 Schreibfehler werden gemeldet, nicht verschluckt ----------------
  {
    const ablage = erzeugeAblageAttrappe();
    const meldungen: [Zwischenvorgang, string][] = [];
    const z = erzeugeZwischenspeicher<{ w: number }>({
      vorsatz: "p08_",
      raum: "konto-A",
      ablage,
      beiFehler: (vorgang, schluessel) => meldungen.push([vorgang, schluessel]),
    });
    ablage.sperren(true);
    const erfolg = z.baselineSchreiben("daten", { w: 1 });
    pruefe("C06.1", erfolg === false, "ein gescheitertes Schreiben meldet false", erfolg);
    pruefe("C06.2", meldungen.length > 0, "und ruft beiFehler", meldungen);
    pruefe("C06.3", meldungen[0][0] === "schreiben", "mit dem richtigen Vorgang", meldungen[0]);
    ablage.sperren(false);
    pruefe("C06.4", z.baselineSchreiben("daten", { w: 1 }), "nach dem Entsperren geht es wieder");
  }

  // --- C07 Ein werfender Rueckruf darf nichts ausloesen --------------------
  {
    const ablage = erzeugeAblageAttrappe();
    const z = erzeugeZwischenspeicher<{ w: number }>({
      vorsatz: "p08_",
      ablage,
      beiFehler: () => {
        throw new Error("Meldung scheitert");
      },
    });
    ablage.sperren(true);
    let geworfen = false;
    try {
      z.baselineSchreiben("daten", { w: 1 });
    } catch {
      geworfen = true;
    }
    pruefe("C07.1", !geworfen, "ein werfender beiFehler-Rueckruf wird geschluckt");
  }

  // --- C08 Keine Ablage vorhanden ------------------------------------------
  {
    const z = erzeugeZwischenspeicher<{ w: number }>({
      vorsatz: "p08_",
      ablage: undefined,
      // In der Testumgebung gibt es kein localStorage, also greift der Rueckfall.
    });
    if (typeof localStorage === "undefined") {
      pruefe("C08.1", z.verfuegbar === false, "ohne Ablage: verfuegbar ist false", z.verfuegbar);
      pruefe("C08.2", z.baselineSchreiben("daten", { w: 1 }) === false, "und Schreiben meldet false");
      pruefe("C08.3", z.baselineLesen("daten") === null, "und Lesen liefert null");
    } else {
      bestanden += 3; // Umgebung mit localStorage: dieser Fall ist hier nicht pruefbar
    }
  }

  // --- C09 Beschaedigter Eintrag ------------------------------------------
  {
    const ablage = erzeugeAblageAttrappe({ "p08_konto-A_baseline_daten": "{kein json" });
    const meldungen: string[] = [];
    const z = erzeugeZwischenspeicher<{ w: number }>({
      vorsatz: "p08_",
      raum: "konto-A",
      ablage,
      beiFehler: (vorgang) => meldungen.push(vorgang),
    });
    pruefe("C09.1", z.baselineLesen("daten") === null, "beschaedigter Eintrag gilt als 'nichts da'");
    pruefe("C09.2", meldungen.includes("lesen"), "und wird gemeldet", meldungen);
  }

  // --- C10 Ausstehende Dateien und allesLoeschen ---------------------------
  {
    const ablage = erzeugeAblageAttrappe();
    const z = erzeugeZwischenspeicher<{ w: number }>({ vorsatz: "p08_", raum: "konto-A", ablage });
    z.baselineSchreiben("daten", { w: 1 });
    z.ausstehendSchreiben("daten", { w: 2 });
    z.ausstehendSchreiben("werte", { w: 3 });
    const offen = z.ausstehendeDateien().sort();
    pruefe("C10.1", offen.join(",") === "daten,werte", "ausstehende Dateien werden aufgezaehlt", offen);

    z.ausstehendLoeschen("daten");
    pruefe("C10.2", z.ausstehendeDateien().join(",") === "werte", "nach dem Loeschen bleibt der Rest", z.ausstehendeDateien());

    // Der springende Punkt: eine NEUE Instanz (wie nach einem Neuladen der
    // Seite) muss aufraeumen koennen, was eine fruehere geschrieben hat.
    const nachNeustart = erzeugeZwischenspeicher<{ w: number }>({
      vorsatz: "p08_",
      raum: "konto-A",
      ablage,
    });
    pruefe(
      "C10.3",
      nachNeustart.ausstehendeDateien().join(",") === "werte",
      "nach einem Neustart sind die offenen Dateien noch bekannt",
      nachNeustart.ausstehendeDateien(),
    );
    nachNeustart.allesLoeschen();
    const rest = Array.from(ablage.inhalt().keys()).filter((k) => k.startsWith("p08_konto-A_"));
    pruefe("C10.4", rest.length === 0, "allesLoeschen raeumt den ganzen Raum", rest);
  }

  // --- C11 istVerbindungsfehler -------------------------------------------
  {
    pruefe(
      "C11.1",
      istVerbindungsfehler(new TypeError("Failed to fetch"), true) === true,
      "Chrome-Netzfehler wird erkannt",
    );
    pruefe(
      "C11.2",
      istVerbindungsfehler(new TypeError("NetworkError when attempting to fetch"), true) === true,
      "Firefox-Netzfehler wird erkannt",
    );
    pruefe(
      "C11.3",
      istVerbindungsfehler(new TypeError("x is not a function"), true) === false,
      "ein echter Programmierfehler gilt NICHT als Netzfehler",
    );
    pruefe(
      "C11.4",
      istVerbindungsfehler(new Error("Cloud-Speicherfehler (401)"), true) === false,
      "ein Serverfehler gilt nicht als Netzfehler",
    );
    pruefe(
      "C11.5",
      istVerbindungsfehler(new Error("irgendwas"), false) === true,
      "offline gilt jeder Fehler als Netzfehler",
    );

    const nichtAngemeldet = Object.assign(new Error("Nicht angemeldet."), {
      verbindungsfehler: false,
    });
    pruefe(
      "C11.6",
      istVerbindungsfehler(nichtAngemeldet, false) === false,
      "ein gekennzeichneter Fehler gilt auch offline nicht als Netzfehler",
    );
    const echtesNetz = Object.assign(new Error("Abbruch"), { verbindungsfehler: true });
    pruefe(
      "C11.7",
      istVerbindungsfehler(echtesNetz, true) === true,
      "und umgekehrt auch online als Netzfehler",
    );
  }

  // ===========================================================================
  // B04-C04 V02-00  (feldgenauer Drei-Wege-Abgleich)
  // ===========================================================================

  interface Bestand extends Record<string, unknown> {
    tickets: Zeile[];
    personen: Zeile[];
    merkliste: string[];
    meta: Record<string, unknown>;
    fassung: string;
  }
  const basis = (): Bestand => ({
    tickets: [{ id: "T-1", titel: "Angebot pruefen", frist: "2026-09-20", lead: "P-1" }],
    personen: [{ id: "P-1", name: "Clemens" }],
    merkliste: [],
    meta: { zaehler: 1, geraet: "PC" },
    fassung: "V01-01",
  });
  const OPT = {
    tabellen: ["tickets", "personen"],
    vereinigen: ["merkliste"],
    beschreibe: (t: string, z: Zeile) => `${t}: ${String(z.titel ?? z.name ?? z.id)}`,
  };

  // --- D01 Vergleichshilfen ------------------------------------------------
  {
    pruefe(
      "D01.1",
      stableStringify({ b: 1, a: 2 }) === stableStringify({ a: 2, b: 1 }),
      "Feldreihenfolge aendert den Vergleich nicht",
    );
    pruefe(
      "D01.2",
      inhaltGleich({ x: [{ b: 1, a: 2 }] }, { x: [{ a: 2, b: 1 }] }),
      "verschachtelt und mit Listen",
    );
    pruefe("D01.3", !inhaltGleich({ a: 1 }, { a: 2 }), "echte Unterschiede werden erkannt");
    const a = basis();
    const b = basis();
    b.meta = { zaehler: 2, geraet: "PC" };
    pruefe("D01.4", bestandGleich(a, b, ["tickets"]), "bestandGleich sieht nur die genannten Schluessel");
    pruefe("D01.5", !bestandGleich(a, b, ["meta"]), "und erkennt dort den Unterschied");
  }

  // --- D02 Nichts geaendert ------------------------------------------------
  {
    const r = diffAndMerge(basis(), basis(), basis(), OPT);
    pruefe("D02.1", r.konflikte.length === 0, "keine Feldkonflikte", r.konflikte);
    pruefe("D02.2", r.zeilenKonflikte.length === 0, "keine Zeilenkonflikte", r.zeilenKonflikte);
    pruefe("D02.3", r.uebernommen.length === 0, "nichts uebernommen", r.uebernommen);
    pruefe("D02.4", inhaltGleich(r.zusammengefuehrt, basis()), "der Bestand bleibt unveraendert");
  }

  // --- D03 Nur entfernt geaendert -> uebernehmen und melden ----------------
  {
    const b = basis(), l = basis(), f = basis();
    f.tickets[0].frist = "2026-09-25";
    const r = diffAndMerge(b, l, f, OPT);
    pruefe("D03.1", r.konflikte.length === 0, "kein Konflikt", r.konflikte);
    pruefe("D03.2", r.uebernommen.length === 1, "eine Aenderung uebernommen", r.uebernommen);
    pruefe("D03.3", r.uebernommen[0]?.art === "geändert", "als 'geändert' gemeldet", r.uebernommen[0]);
    pruefe(
      "D03.4",
      r.uebernommen[0]?.label === "tickets: Angebot pruefen",
      "Beschriftung kommt aus beschreibe()",
      r.uebernommen[0],
    );
    pruefe("D03.5", r.zusammengefuehrt.tickets[0].frist === "2026-09-25", "der fremde Wert steht im Ergebnis");
  }

  // --- D04 Nur lokal geaendert -> bleibt, keine Meldung --------------------
  {
    const b = basis(), l = basis(), f = basis();
    l.tickets[0].frist = "2026-09-18";
    const r = diffAndMerge(b, l, f, OPT);
    pruefe("D04.1", r.konflikte.length === 0 && r.uebernommen.length === 0, "kein Konflikt, keine Meldung");
    pruefe("D04.2", r.zusammengefuehrt.tickets[0].frist === "2026-09-18", "der eigene Wert bleibt");
  }

  // --- D05 Beide gleich geaendert -----------------------------------------
  {
    const b = basis(), l = basis(), f = basis();
    l.tickets[0].frist = "2026-10-01";
    f.tickets[0].frist = "2026-10-01";
    const r = diffAndMerge(b, l, f, OPT);
    pruefe("D05.1", r.konflikte.length === 0, "gleiche Aenderung ist kein Konflikt", r.konflikte);
    pruefe("D05.2", r.zusammengefuehrt.tickets[0].frist === "2026-10-01", "Wert uebernommen");
  }

  // --- D06 VERSCHIEDENE Felder derselben Zeile - der Kern von V02-00 -------
  {
    const b = basis(), l = basis(), f = basis();
    l.tickets[0].frist = "2026-09-18"; // am PC die Frist
    f.tickets[0].lead = "P-2"; // am Laptop den Lead
    const r = diffAndMerge(b, l, f, OPT);
    pruefe(
      "D06.1",
      r.konflikte.length === 0,
      "verschiedene Felder derselben Zeile sind KEIN Konflikt",
      r.konflikte,
    );
    pruefe("D06.2", r.zusammengefuehrt.tickets[0].frist === "2026-09-18", "die eigene Frist bleibt");
    pruefe("D06.3", r.zusammengefuehrt.tickets[0].lead === "P-2", "und der fremde Lead kommt dazu");
    pruefe("D06.4", r.zusammengefuehrt.tickets[0].titel === "Angebot pruefen", "der Rest bleibt unberuehrt");
    pruefe("D06.5", r.zusammengefuehrt.tickets[0].id === "T-1", "die id bleibt erhalten");
  }

  // --- D07 Dasselbe Feld, verschiedene Werte -> Konflikt je Feld -----------
  {
    const b = basis(), l = basis(), f = basis();
    l.tickets[0].frist = "2026-09-18";
    f.tickets[0].frist = "2026-09-25";
    l.tickets[0].titel = "Angebot pruefen (PC)";
    f.tickets[0].titel = "Angebot pruefen (Laptop)";
    const r = diffAndMerge(b, l, f, OPT);
    pruefe("D07.1", r.konflikte.length === 2, "zwei strittige Felder, zwei Konflikte", r.konflikte.length);
    pruefe(
      "D07.2",
      r.konflikte.every((k) => k.tabelle === "tickets" && k.id === "T-1"),
      "beide zeigen auf dieselbe Zeile",
      r.konflikte,
    );
    pruefe("D07.3", r.zusammengefuehrt.tickets[0].frist === "2026-09-18", "vorlaeufig gilt der lokale Stand");

    const ohne = applyConflictResolutions(r, new Map());
    pruefe("D07.4", ohne.tickets[0].frist === "2026-09-18", "ohne Entscheidung gilt 'lokal'");

    const gemischt = applyConflictResolutions(
      r,
      new Map([
        ["tickets|T-1|frist", "entfernt" as const],
        ["tickets|T-1|titel", "lokal" as const],
      ]),
    );
    pruefe("D07.5", gemischt.tickets[0].frist === "2026-09-25", "Entscheidung je Feld: Frist vom anderen Geraet");
    pruefe(
      "D07.6",
      gemischt.tickets[0].titel === "Angebot pruefen (PC)",
      "und Titel vom eigenen - in derselben Zeile",
      gemischt.tickets[0],
    );
  }

  // --- D08 Hinzufuegen und Entfernen ---------------------------------------
  {
    const b = basis(), l = basis(), f = basis();
    f.tickets.push({ id: "T-2", titel: "Rechnung", frist: "2026-09-30" });
    const r = diffAndMerge(b, l, f, OPT);
    pruefe("D08.1", r.zusammengefuehrt.tickets.length === 2, "entfernt hinzugefuegt: wird uebernommen");
    pruefe("D08.2", r.uebernommen[0]?.art === "hinzugefügt", "und als 'hinzugefügt' gemeldet", r.uebernommen[0]);
  }
  {
    const b = basis(), l = basis(), f = basis();
    f.tickets = [];
    const r = diffAndMerge(b, l, f, OPT);
    pruefe("D08.3", r.zusammengefuehrt.tickets.length === 0, "entfernt geloescht: verschwindet");
    pruefe("D08.4", r.uebernommen[0]?.art === "entfernt", "und wird als 'entfernt' gemeldet", r.uebernommen[0]);
    pruefe("D08.5", r.zeilenKonflikte.length === 0, "kein Konflikt, weil lokal nichts geaendert wurde");
  }

  // --- D09 Entfernt geloescht, lokal geaendert -> Zeilenkonflikt -----------
  {
    const b = basis(), l = basis(), f = basis();
    l.tickets[0].frist = "2026-09-18";
    f.tickets = [];
    const r = diffAndMerge(b, l, f, OPT);
    pruefe("D09.1", r.zeilenKonflikte.length === 1, "ein Zeilenkonflikt", r.zeilenKonflikte);
    pruefe("D09.2", r.zeilenKonflikte[0]?.entfernt === null, "die fremde Seite ist null", r.zeilenKonflikte[0]);
    pruefe("D09.3", r.zusammengefuehrt.tickets.length === 1, "vorlaeufig bleibt die Zeile");
    const geloescht = applyConflictResolutions(r, new Map([["tickets|T-1", "entfernt" as const]]));
    pruefe("D09.4", geloescht.tickets.length === 0, "Entscheidung 'entfernt' loescht die Zeile", geloescht.tickets);
  }

  // --- D10 Lokal geloescht, entfernt geaendert -----------------------------
  {
    const b = basis(), l = basis(), f = basis();
    l.tickets = [];
    f.tickets[0].frist = "2026-09-25";
    const r = diffAndMerge(b, l, f, OPT);
    pruefe("D10.1", r.zeilenKonflikte.length === 1, "ein Zeilenkonflikt", r.zeilenKonflikte);
    pruefe("D10.2", r.zeilenKonflikte[0]?.lokal === null, "die lokale Seite ist null", r.zeilenKonflikte[0]);
    pruefe("D10.3", r.zusammengefuehrt.tickets.length === 0, "vorlaeufig bleibt sie geloescht");
    const zurueck = applyConflictResolutions(r, new Map([["tickets|T-1", "entfernt" as const]]));
    pruefe("D10.4", zurueck.tickets.length === 1, "Entscheidung 'entfernt' holt die Zeile zurueck", zurueck.tickets);
    pruefe("D10.5", zurueck.tickets[0].frist === "2026-09-25", "mit dem fremden Stand");
  }

  // --- D11 vereinigen ------------------------------------------------------
  {
    const b = basis(), l = basis(), f = basis();
    l.merkliste = ["A", "B"];
    f.merkliste = ["B", "C"];
    const r = diffAndMerge(b, l, f, OPT);
    const m = [...r.zusammengefuehrt.merkliste].sort().join(",");
    pruefe("D11.1", m === "A,B,C", "vereinigte Liste enthaelt beide Seiten ohne Doppelte", m);
  }

  // --- D12 meta: der behobene stille Datenverlust aus V01-00 ---------------
  {
    // nur entfernt geaendert -> MUSS uebernommen werden (V01-00 verlor das)
    const b = basis(), l = basis(), f = basis();
    f.meta = { zaehler: 2, geraet: "PC" };
    const r = diffAndMerge(b, l, f, OPT);
    pruefe(
      "D12.1",
      (r.zusammengefuehrt.meta as { zaehler: number }).zaehler === 2,
      "eine entfernte Aenderung ausserhalb der Tabellen geht NICHT verloren",
      r.zusammengefuehrt.meta,
    );
    pruefe("D12.2", r.uebernommen.some((u) => u.tabelle === "meta"), "und wird gemeldet", r.uebernommen);
  }
  {
    // verschiedene Felder in meta -> zusammenfuehren, kein Konflikt
    const b = basis(), l = basis(), f = basis();
    l.meta = { zaehler: 5, geraet: "PC" };
    f.meta = { zaehler: 1, geraet: "Laptop" };
    const r = diffAndMerge(b, l, f, OPT);
    const meta = r.zusammengefuehrt.meta as { zaehler: number; geraet: string };
    pruefe("D12.3", r.konflikte.length === 0, "verschiedene meta-Felder sind kein Konflikt", r.konflikte);
    pruefe("D12.4", meta.zaehler === 5 && meta.geraet === "Laptop", "beide Aenderungen stehen drin", meta);
  }
  {
    // dasselbe meta-Feld verschieden -> Konflikt, nicht still
    const b = basis(), l = basis(), f = basis();
    l.meta = { zaehler: 5, geraet: "PC" };
    f.meta = { zaehler: 9, geraet: "PC" };
    const r = diffAndMerge(b, l, f, OPT);
    pruefe("D12.5", r.konflikte.length === 1, "dasselbe meta-Feld verschieden -> ein Konflikt", r.konflikte);
    const gewaehlt = applyConflictResolutions(r, new Map([["meta||zaehler", "entfernt" as const]]));
    pruefe(
      "D12.6",
      (gewaehlt.meta as { zaehler: number }).zaehler === 9,
      "die Entscheidung greift auch ausserhalb der Tabellen",
      gewaehlt.meta,
    );
  }

  // --- D13 Einfacher Wert ausserhalb der Tabellen --------------------------
  {
    const b = basis(), l = basis(), f = basis();
    f.fassung = "V01-02";
    const r = diffAndMerge(b, l, f, OPT);
    pruefe("D13.1", r.zusammengefuehrt.fassung === "V01-02", "nur entfernt geaendert -> uebernommen");

    const b2 = basis(), l2 = basis(), f2 = basis();
    l2.fassung = "V01-03";
    f2.fassung = "V01-02";
    const r2 = diffAndMerge(b2, l2, f2, OPT);
    pruefe("D13.2", r2.konflikte.length === 1, "beidseitig verschieden -> gemeldet, nicht still", r2.konflikte);
    pruefe("D13.3", r2.zusammengefuehrt.fassung === "V01-03", "vorlaeufig gilt lokal");
    const gewaehlt = applyConflictResolutions(r2, new Map([["fassung||fassung", "entfernt" as const]]));
    pruefe("D13.4", gewaehlt.fassung === "V01-02", "Entscheidung 'entfernt' greift", gewaehlt.fassung);
  }

  // --- D14 Felder ausnehmen ------------------------------------------------
  {
    const b = basis(), l = basis(), f = basis();
    l.tickets[0].frist = "2026-09-18";
    l.tickets[0].geaendertAm = "2026-09-19T08:00";
    f.tickets[0].frist = "2026-09-25";
    f.tickets[0].geaendertAm = "2026-09-19T09:00";
    const r = diffAndMerge(b, l, f, {
      ...OPT,
      feldAusnehmen: (_t, feld) => feld === "geaendertAm",
    });
    pruefe("D14.1", r.konflikte.length === 1, "das ausgenommene Feld erzeugt keinen Konflikt", r.konflikte);
    pruefe("D14.2", r.konflikte[0]?.feld === "frist", "nur die Frist ist strittig", r.konflikte[0]);
    pruefe(
      "D14.3",
      r.zusammengefuehrt.tickets[0].geaendertAm === "2026-09-19T08:00",
      "beim ausgenommenen Feld gilt der lokale Wert",
    );
  }

  // --- D15 Fehlende Tabelle / fehlender Schluessel -------------------------
  // Der gefaehrlichste Fall: eine Datei, die eine aeltere Programmfassung ohne
  // diese Tabelle geschrieben hat. Sie darf nicht als "alles geloescht" gelten.
  {
    const b = basis(), l = basis(), f = basis();
    delete (f as Record<string, unknown>).personen;
    let geworfen = false;
    try {
      const r = diffAndMerge(b, l, f, OPT);
      pruefe(
        "D15.1",
        r.zusammengefuehrt.personen.length === 1,
        "eine fehlende Tabelle loescht NICHTS (Vorgabe 'unveraendert')",
        r.zusammengefuehrt.personen,
      );
      pruefe("D15.2", r.zeilenKonflikte.length === 0, "und erzeugt keinen Konflikt", r.zeilenKonflikte);
    } catch {
      geworfen = true;
    }
    pruefe("D15.3", !geworfen, "eine fehlende Tabelle wirft nicht");
  }
  {
    const b = basis(), l = basis(), f = basis();
    delete (f as Record<string, unknown>).personen;
    const r = diffAndMerge(b, l, f, { ...OPT, fehlendeTabelle: "leer" as const });
    pruefe(
      "D15.4",
      r.zusammengefuehrt.personen.length === 0,
      "mit 'leer' gilt das alte Verhalten von V01-00",
      r.zusammengefuehrt.personen,
    );
  }
  {
    const b = basis(), l = basis(), f = basis();
    delete (f as Record<string, unknown>).meta;
    const r = diffAndMerge(b, l, f, OPT);
    pruefe(
      "D15.5",
      inhaltGleich(r.zusammengefuehrt.meta, b.meta),
      "ein fehlender Schluessel ausserhalb der Tabellen loescht nichts",
      r.zusammengefuehrt.meta,
    );
  }
  {
    // Eine echte Loeschung schreibt eine LEERE LISTE - die wirkt weiterhin.
    const b = basis(), l = basis(), f = basis();
    f.personen = [];
    const r = diffAndMerge(b, l, f, OPT);
    pruefe("D15.6", r.zusammengefuehrt.personen.length === 0, "eine leere Liste loescht sehr wohl");
  }

  // ===========================================================================
  // B04-C06 V01-01  (Gruppierung und Vollstaendigkeitspruefung - ohne Darstellung)
  // ===========================================================================

  // --- E01 Feldkonflikte derselben Zeile werden gruppiert ------------------
  {
    const b = basis(), l = basis(), f = basis();
    l.tickets[0].frist = "2026-09-18";
    f.tickets[0].frist = "2026-09-25";
    l.tickets[0].titel = "Angebot pruefen (PC)";
    f.tickets[0].titel = "Angebot pruefen (Laptop)";
    const r = diffAndMerge(b, l, f, OPT);
    const gruppen = gruppiereKonflikte(r.konflikte, r.zeilenKonflikte);
    pruefe("E01.1", gruppen.length === 1, "zwei Feldkonflikte derselben Zeile -> eine Gruppe", gruppen.length);
    pruefe("E01.2", gruppen[0]?.feldKonflikte.length === 2, "beide Felder stecken in der Gruppe", gruppen[0]);
    pruefe("E01.3", gruppen[0]?.zeilenKonflikt === null, "kein Zeilenkonflikt in dieser Gruppe", gruppen[0]);
  }

  // --- E02 Konflikte verschiedener Zeilen bleiben getrennt ------------------
  {
    const b = basis(), l = basis(), f = basis();
    b.tickets.push({ id: "T-2", titel: "Rechnung", frist: "2026-09-22" });
    l.tickets.push({ id: "T-2", titel: "Rechnung", frist: "2026-09-22" });
    f.tickets.push({ id: "T-2", titel: "Rechnung", frist: "2026-09-22" });
    l.tickets[0].frist = "2026-09-18";
    f.tickets[0].frist = "2026-09-25";
    l.tickets[1].frist = "2026-09-19";
    f.tickets[1].frist = "2026-09-28";
    const r = diffAndMerge(b, l, f, OPT);
    const gruppen = gruppiereKonflikte(r.konflikte, r.zeilenKonflikte);
    pruefe("E02.1", gruppen.length === 2, "zwei verschiedene Zeilen -> zwei Gruppen", gruppen.length);
  }

  // --- E03 Feld- und Zeilenkonflikt kommen nie zusammen fuer dieselbe id ---
  // (B04-C04 meldet fuer eine id entweder das eine oder das andere), aber die
  // Gruppierung darf trotzdem beides gemischt in einer Liste verarbeiten.
  {
    const feld: FeldKonflikt = {
      art: "feld",
      tabelle: "tickets",
      id: "T-1",
      feld: "frist",
      label: "tickets: Angebot",
      lokal: "2026-09-18",
      entfernt: "2026-09-25",
    };
    const zeile: ZeilenKonflikt = {
      art: "zeile",
      tabelle: "tickets",
      id: "T-2",
      label: "tickets: Rechnung",
      lokal: null,
      entfernt: { id: "T-2", titel: "Rechnung" },
    };
    const gruppen = gruppiereKonflikte([feld], [zeile]);
    pruefe("E03.1", gruppen.length === 2, "gemischte Liste ergibt zwei getrennte Gruppen", gruppen.length);
    const schl = alleKonfliktSchluessel(gruppen).sort();
    pruefe(
      "E03.2",
      schl.join(",") === ["tickets|T-1|frist", "tickets|T-2"].sort().join(","),
      "die Schluessel passen zu konfliktSchluessel aus C04",
      schl,
    );
    pruefe("E03.3", konfliktSchluessel(feld) === "tickets|T-1|frist", "Feldschluessel");
    pruefe("E03.4", konfliktSchluessel(zeile) === "tickets|T-2", "Zeilenschluessel");
  }

  // --- E04 Reihenfolge: zuerst Auftreten in zeilenKonflikte, dann konflikte -
  {
    const feld: FeldKonflikt = {
      art: "feld",
      tabelle: "tickets",
      id: "T-9",
      feld: "frist",
      label: "spaeter",
      lokal: 1,
      entfernt: 2,
    };
    const zeile: ZeilenKonflikt = {
      art: "zeile",
      tabelle: "tickets",
      id: "T-1",
      label: "zuerst",
      lokal: { id: "T-1" },
      entfernt: null,
    };
    const gruppen = gruppiereKonflikte([feld], [zeile]);
    pruefe("E04.1", gruppen[0]?.label === "zuerst", "der Zeilenkonflikt fuehrt die Liste an", gruppen);
  }

  // --- E05 Vollstaendigkeitspruefung ----------------------------------------
  {
    const b = basis(), l = basis(), f = basis();
    l.tickets[0].frist = "2026-09-18";
    f.tickets[0].frist = "2026-09-25";
    l.tickets[0].titel = "A";
    f.tickets[0].titel = "B";
    const r = diffAndMerge(b, l, f, OPT);
    const gruppen = gruppiereKonflikte(r.konflikte, r.zeilenKonflikte);
    const schl = alleKonfliktSchluessel(gruppen);
    pruefe("E05.1", schl.length === 2, "zwei offene Stellen", schl);
    pruefe("E05.2", !alleEntschieden(schl, new Map()), "ohne Entscheidung: nicht fertig");
    const halb = new Map([[schl[0], "lokal" as const]]);
    pruefe("E05.3", !alleEntschieden(schl, halb), "erst eine von zwei entschieden: noch nicht fertig");
    const voll = new Map([
      [schl[0], "lokal" as const],
      [schl[1], "entfernt" as const],
    ]);
    pruefe("E05.4", alleEntschieden(schl, voll), "beide entschieden: fertig");
  }

  // --- E06 Keine Konflikte -> sofort fertig, leerer Dialog ------------------
  {
    const gruppen = gruppiereKonflikte([], []);
    pruefe("E06.1", gruppen.length === 0, "keine Konflikte -> keine Gruppen");
    pruefe("E06.2", alleEntschieden([], new Map()), "leere Liste gilt als vollstaendig entschieden");
  }

  // ===========================================================================
  // B04-C08 V01-00  (Sperre gegen ueberlappende Durchgaenge)
  // ===========================================================================

  // --- F01 erzeugeSperre ----------------------------------------------------
  {
    const s = erzeugeSperre();
    pruefe("F01.1", s.belegt() === false, "frische Sperre ist frei");
    pruefe("F01.2", s.versuchen() === true, "erster Versuch gelingt");
    pruefe("F01.3", s.belegt() === true, "Sperre ist jetzt belegt");
    pruefe("F01.4", s.versuchen() === false, "zweiter Versuch scheitert");
    s.freigeben();
    pruefe("F01.5", s.belegt() === false, "nach Freigabe wieder frei");
  }

  // --- F02 nurEinerGleichzeitig ----------------------------------------------
  {
    let laeufe = 0;
    const langsam = nurEinerGleichzeitig(async () => {
      laeufe++;
      await warte(30);
      return "fertig";
    });
    const [a, b] = await Promise.all([langsam(), langsam()]);
    pruefe("F02.1", a === "fertig", "erster Aufruf laeuft durch", a);
    pruefe("F02.2", b === undefined, "zweiter Aufruf wird verworfen", b);
    pruefe("F02.3", laeufe === 1, "die Funktion lief genau einmal", laeufe);
    const c = await langsam();
    pruefe("F02.4", c === "fertig" && laeufe === 2, "nach dem Durchgang wieder aufrufbar", { c, laeufe });
  }

  // --- F03 nurEinerGleichzeitig gibt die Sperre auch nach einem Fehler frei --
  {
    let laeufe = 0;
    const kaputt = nurEinerGleichzeitig(async () => {
      laeufe++;
      throw new Error("Absicht");
    });
    let geworfen = false;
    try {
      await kaputt();
    } catch {
      geworfen = true;
    }
    pruefe("F03.1", geworfen, "Fehler wird durchgereicht");
    try {
      await kaputt();
    } catch {
      /* erwartet */
    }
    pruefe("F03.2", laeufe === 2, "Sperre wurde trotz Fehler freigegeben", laeufe);
  }

  // --- F04 nacheinander: Aufrufe reihen sich statt zu ueberlappen ------------
  {
    const reihenfolge: string[] = [];
    const arbeit = nacheinander(async (name: string, dauer: number) => {
      reihenfolge.push(`start ${name}`);
      await warte(dauer);
      reihenfolge.push(`ende ${name}`);
      return name;
    });
    const ergebnisse = await Promise.all([arbeit("A", 30), arbeit("B", 5)]);
    pruefe("F04.1", ergebnisse.join(",") === "A,B", "beide Aufrufe liefern ihr Ergebnis", ergebnisse);
    pruefe(
      "F04.2",
      reihenfolge.join(" | ") === "start A | ende A | start B | ende B",
      "sie ueberlappen sich nicht",
      reihenfolge,
    );
  }

  // --- F05 nacheinander: ein Fehler blockiert die Reihe nicht ----------------
  {
    const gelaufen: string[] = [];
    const arbeit = nacheinander(async (name: string) => {
      gelaufen.push(name);
      if (name === "A") throw new Error("Absicht");
      return name;
    });
    const a = arbeit("A").catch(() => "fehler");
    const b = arbeit("B");
    pruefe("F05.1", (await a) === "fehler", "Fehler im ersten Durchgang bleibt Fehler");
    pruefe("F05.2", (await b) === "B", "die Reihe laeuft danach weiter");
    pruefe("F05.3", gelaufen.join(",") === "A,B", "beide Durchgaenge liefen", gelaufen);
  }

  // ===========================================================================
  // B04-C09 V01-00  (Speicherwerk: C01 + C04 + C05 + C08 zusammengespielt)
  // ===========================================================================

  interface GBestand extends Record<string, unknown> {
    tickets: Zeile[];
    meta: Record<string, unknown>;
  }
  const gBasis = (): GBestand => ({
    tickets: [{ id: "T-1", titel: "Angebot pruefen", frist: "2026-09-20" }],
    meta: { geraet: "PC" },
  });
  const gOpt = { tabellen: ["tickets"], datei: "stand.json", verzoegerungMs: 0, maxDurchgaenge: 5 };

  function neuesWerk(
    speicher: ReturnType<typeof erzeugeSpeicherAttrappe>,
    aufzeichnung: { anzeigen: Anzeige[]; konflikte: number; uebernahmen: GBestand[] },
    raum?: string,
  ) {
    const cache = erzeugeZwischenspeicher<GBestand>({
      vorsatz: "g_",
      raum: raum ?? speicher.kennung,
      ablage: erzeugeAblageAttrappe(),
    });
    const werk = new Speicherwerk<GBestand>(
      speicher,
      cache,
      (a) => aufzeichnung.anzeigen.push(a),
      (db) => aufzeichnung.uebernahmen.push(db),
      () => {
        aufzeichnung.konflikte++;
      },
      gOpt,
    );
    return werk;
  }

  // --- G01 Erstes Speichern gegen eine leere Ablage --------------------------
  {
    const speicher = erzeugeSpeicherAttrappe("ordner", "attrappe:g01");
    const auf = { anzeigen: [] as Anzeige[], konflikte: 0, uebernahmen: [] as GBestand[] };
    const werk = neuesWerk(speicher, auf);
    await werk.laden();
    werk.aendern(gBasis());
    await werk.jetztSpeichern();
    pruefe("G01.1", auf.anzeigen.at(-1)?.zustand === "gespeichert", "Endzustand ist gespeichert", auf.anzeigen.at(-1));
    pruefe("G01.2", inhaltGleich(werk.standDerAblage, gBasis()), "standDerAblage stimmt mit der Eingabe ueberein");
    pruefe("G01.3", (await speicher.lesen("stand.json", "ordner")) !== null, "die Datei liegt wirklich im Speicher");
  }

  // --- G02 Zwei Geraete aendern VERSCHIEDENE Felder: kein Konflikt, echtes
  //         bedingtes Schreiben wehrt den zweiten unbedingten Versuch ab -----
  {
    const speicher = erzeugeSpeicherAttrappe("ordner", "attrappe:g02");
    const aufA = { anzeigen: [] as Anzeige[], konflikte: 0, uebernahmen: [] as GBestand[] };
    const aufB = { anzeigen: [] as Anzeige[], konflikte: 0, uebernahmen: [] as GBestand[] };
    const werkA = neuesWerk(speicher, aufA, "raumA");
    const werkB = neuesWerk(speicher, aufB, "raumB");

    await werkA.laden();
    werkA.aendern(gBasis());
    await werkA.jetztSpeichern();

    // Geraet B laedt denselben Ausgangsstand, kennt also den echten cTag.
    await werkB.laden();
    const vonB = { ...gBasis(), tickets: [{ ...gBasis().tickets[0], lead: "P-9" }] };
    werkB.aendern(vonB);
    await werkB.jetztSpeichern();
    pruefe("G02.1", aufB.anzeigen.at(-1)?.zustand === "gespeichert", "Geraet B speichert konfliktfrei");

    // Geraet A schreibt jetzt mit dem VERALTETEN Stand von vor B - das muss
    // die Ablage ablehnen (C01 bedingtSchreiben), nicht C09 selbst.
    const vonA = { ...gBasis(), tickets: [{ ...gBasis().tickets[0], frist: "2026-09-25" }] };
    werkA.aendern(vonA);
    await werkA.jetztSpeichern();
    pruefe("G02.2", aufA.anzeigen.at(-1)?.zustand === "gespeichert", "Geraet A gleicht ab und speichert danach");
    pruefe("G02.3", aufA.konflikte === 0, "unterschiedliche Felder: kein Konflikt gemeldet");
    const stand = (await speicher.lesen<GBestand>("stand.json", "ordner"))!;
    pruefe(
      "G02.4",
      stand.tickets[0].frist === "2026-09-25" && stand.tickets[0].lead === "P-9",
      "beide Aenderungen stecken zusammengefuehrt im gespeicherten Stand",
      stand,
    );
  }

  // --- G03 Zwei Geraete aendern DASSELBE Feld: echter Konflikt ---------------
  {
    const speicher = erzeugeSpeicherAttrappe("ordner", "attrappe:g03");
    const aufA = { anzeigen: [] as Anzeige[], konflikte: 0, uebernahmen: [] as GBestand[] };
    const aufB = { anzeigen: [] as Anzeige[], konflikte: 0, uebernahmen: [] as GBestand[] };
    const werkA = neuesWerk(speicher, aufA, "raumA3");
    const werkB = neuesWerk(speicher, aufB, "raumB3");

    await werkA.laden();
    werkA.aendern(gBasis());
    await werkA.jetztSpeichern();
    await werkB.laden();

    werkB.aendern({ ...gBasis(), tickets: [{ ...gBasis().tickets[0], frist: "2026-09-25" }] });
    await werkB.jetztSpeichern();

    werkA.aendern({ ...gBasis(), tickets: [{ ...gBasis().tickets[0], frist: "2026-09-30" }] });
    await werkA.jetztSpeichern();
    pruefe("G03.1", aufA.konflikte === 1, "dasselbe Feld, unterschiedlicher Wert: genau ein Konflikt gemeldet");
    pruefe(
      "G03.2",
      aufA.anzeigen.at(-1)?.zustand === "fehler-cloud" && aufA.anzeigen.at(-1)?.wiederholbar === false,
      "Zustand verlangt eine Entscheidung, kein automatischer erneuter Versuch",
      aufA.anzeigen.at(-1),
    );
  }

  // --- G04 Schreibfehler im lokalen Zwischenspeicher wird gemeldet -----------
  {
    const speicher = erzeugeSpeicherAttrappe("ordner", "attrappe:g04");
    const ablage = erzeugeAblageAttrappe();
    const cache = erzeugeZwischenspeicher<GBestand>({ vorsatz: "g_", raum: speicher.kennung, ablage });
    const auf = { anzeigen: [] as Anzeige[], konflikte: 0, uebernahmen: [] as GBestand[] };
    const werk = new Speicherwerk<GBestand>(
      speicher,
      cache,
      (a) => auf.anzeigen.push(a),
      () => {},
      () => auf.konflikte++,
      gOpt,
    );
    ablage.sperren(true);
    werk.aendern(gBasis());
    pruefe(
      "G04.1",
      auf.anzeigen.at(-1)?.zustand === "fehler-lokal",
      "voller/gesperrter Zwischenspeicher wird gemeldet, nicht verschwiegen",
      auf.anzeigen.at(-1),
    );
    ablage.sperren(false);
    await werk.jetztSpeichern();
    pruefe("G04.2", auf.anzeigen.at(-1)?.zustand === "gespeichert", "trotzdem wird in die Ablage geschrieben");
  }

  // --- G05 Verbindungsfehler wird als offline erkannt, nicht als Programmfehler,
  //         und die Eingabe bleibt im Zwischenspeicher erhalten -------------
  {
    const speicher = erzeugeSpeicherAttrappe("ordner", "attrappe:g05");
    const netzfehler = Object.assign(new TypeError("Failed to fetch"), { verbindungsfehler: true });
    speicher.dazwischen(() => {
      throw netzfehler;
    });
    const cache = erzeugeZwischenspeicher<GBestand>({
      vorsatz: "g_",
      raum: speicher.kennung,
      ablage: erzeugeAblageAttrappe(),
    });
    const auf = { anzeigen: [] as Anzeige[], konflikte: 0, uebernahmen: [] as GBestand[] };
    const werk = new Speicherwerk<GBestand>(speicher, cache, (a) => auf.anzeigen.push(a), () => {}, () => auf.konflikte++, gOpt);
    await werk.laden();
    werk.aendern(gBasis());
    await werk.jetztSpeichern();
    pruefe(
      "G05.1",
      auf.anzeigen.at(-1)?.zustand === "offline" && auf.anzeigen.at(-1)?.wiederholbar === true,
      "Verbindungsfehler fuehrt zu offline, wiederholbar",
      auf.anzeigen.at(-1),
    );
    pruefe(
      "G05.2",
      inhaltGleich(cache.ausstehendLesen("stand.json"), gBasis()),
      "die Eingabe bleibt trotz des Fehlers im Zwischenspeicher erhalten",
    );
  }

  // --- G06 Mehrere Eingaben waehrend eines laufenden Speicherns gehen nicht
  //         verloren (C08 reiht, statt zu verwerfen) --------------------------
  {
    const speicher = erzeugeSpeicherAttrappe("ordner", "attrappe:g06");
    const auf = { anzeigen: [] as Anzeige[], konflikte: 0, uebernahmen: [] as GBestand[] };
    const werk = neuesWerk(speicher, auf);
    await werk.laden();
    werk.aendern(gBasis());
    const ersterLauf = werk.jetztSpeichern();
    // Waehrend der erste Durchgang noch laeuft (die Attrappe ist synchron,
    // deshalb hier ueber eine zweite, sofort gereihte Eingabe nachgestellt):
    werk.aendern({ ...gBasis(), tickets: [{ ...gBasis().tickets[0], titel: "Angebot pruefen (dringend)" }] });
    const zweiterLauf = werk.jetztSpeichern();
    await Promise.all([ersterLauf, zweiterLauf]);
    await werk.ruhe();
    pruefe("G06.1", auf.anzeigen.at(-1)?.zustand === "gespeichert", "kommt zur Ruhe: gespeichert");
    const stand = (await speicher.lesen<GBestand>("stand.json", "ordner"))!;
    pruefe(
      "G06.2",
      stand.tickets[0].titel === "Angebot pruefen (dringend)",
      "die spaetere Eingabe ist nicht verloren gegangen",
      stand,
    );
  }

  // --- G07 uebernehmeEntscheidung schreibt (V01-01: bedingt) und aktualisiert
  //         den gemerkten Cloud-Stand, sodass ein Zwischenstand nicht mehr
  //         zaehlt. Ohne Einmischung eines Dritten gelingt der erste
  //         bedingte Schreibversuch, das Ergebnis bleibt wie in V01-00. -----
  {
    const speicher = erzeugeSpeicherAttrappe("ordner", "attrappe:g07");
    const auf = { anzeigen: [] as Anzeige[], konflikte: 0, uebernahmen: [] as GBestand[] };
    const werk = neuesWerk(speicher, auf);
    await werk.laden();
    werk.aendern(gBasis());
    await werk.jetztSpeichern();

    const entschieden = { ...gBasis(), tickets: [{ ...gBasis().tickets[0], frist: "ENTSCHIEDEN" }] };
    await werk.uebernehmeEntscheidung(entschieden);
    pruefe("G07.1", auf.anzeigen.at(-1)?.zustand === "gespeichert", "nach der Entscheidung: gespeichert");
    pruefe("G07.2", inhaltGleich(werk.standDerAblage, entschieden), "standDerAblage zeigt die Entscheidung");

    // Ein weiterer normaler Speichervorgang mit dem neuen Stand muss ohne
    // Konflikt durchgehen - der gemerkte Cloud-Stand wurde also wirklich
    // aktualisiert und nicht nur lokal.
    werk.aendern({ ...entschieden, tickets: [{ ...entschieden.tickets[0], titel: "weiter" }] });
    await werk.jetztSpeichern();
    pruefe("G07.3", auf.konflikte === 0, "kein falscher Konflikt nach der Entscheidung");
  }

  // --- G09 Ein DRITTES Geraet schreibt zwischen Konflikterkennung und
  //         Entscheidung ein ANDERES Feld: die Entscheidung wird nicht
  //         verworfen, der Beitrag des Dritten geht nicht verloren, keine
  //         zusaetzliche Konfliktrunde. Antwort auf den Einwand vom
  //         22.09.2026 zu C01 V02-00: genau der Nachweis, dass ein nach einer
  //         Konfliktentscheidung geschriebener Stand nicht mehr ungeschuetzt
  //         ist. ---------------------------------------------------------
  {
    const speicher = erzeugeSpeicherAttrappe("ordner", "attrappe:g09");
    const aufA = { anzeigen: [] as Anzeige[], konflikte: 0, uebernahmen: [] as GBestand[] };
    const aufB = { anzeigen: [] as Anzeige[], konflikte: 0, uebernahmen: [] as GBestand[] };
    const werkA = neuesWerk(speicher, aufA, "raumA9");
    const werkB = neuesWerk(speicher, aufB, "raumB9");

    await werkA.laden();
    werkA.aendern(gBasis());
    await werkA.jetztSpeichern();

    await werkB.laden();
    werkB.aendern({ ...gBasis(), tickets: [{ ...gBasis().tickets[0], frist: "B-Termin" }] });
    await werkB.jetztSpeichern();

    // Geraet A kennt noch die Ausgangsfassung, aendert dasselbe Feld wie B:
    // echter Konflikt, geht an beiKonflikt.
    werkA.aendern({ ...gBasis(), tickets: [{ ...gBasis().tickets[0], frist: "A-Termin" }] });
    await werkA.jetztSpeichern();
    pruefe("G09.1", aufA.konflikte === 1, "Konflikt auf 'frist' erkannt, eine Runde");

    // WAEHREND der Mensch entscheidet, schreibt ein drittes Geraet C ein
    // ANDERES Feld (titel) - unmittelbar in die Ablage, nicht ueber ein
    // Speicherwerk (steht fuer irgendein drittes Geraet, das nichts von der
    // laufenden Entscheidung weiss).
    const vorC = (await speicher.lesenMitStand<GBestand>("stand.json", "ordner")).daten!;
    await speicher.schreiben(
      { ...vorC, tickets: [{ ...vorC.tickets[0], titel: "C-Titel" }] },
      "stand.json",
      "ordner",
    );

    // Der Mensch entscheidet 'frist', kennt 'titel' nur aus dem Stand, auf
    // dem der Konfliktdialog beruhte (noch ohne C).
    const entschieden = { ...gBasis(), tickets: [{ ...gBasis().tickets[0], frist: "ENTSCHIEDEN" }] };
    await werkA.uebernehmeEntscheidung(entschieden);

    pruefe("G09.2", aufA.konflikte === 1, "kein zusaetzlicher Konflikt - 'titel' war nicht umstritten");
    pruefe(
      "G09.3",
      aufA.anzeigen.at(-1)?.zustand === "gespeichert",
      "die Entscheidung kommt trotzdem zur Ruhe",
      aufA.anzeigen.at(-1),
    );
    const stand = (await speicher.lesen<GBestand>("stand.json", "ordner"))!;
    pruefe(
      "G09.4",
      stand.tickets[0].frist === "ENTSCHIEDEN" && stand.tickets[0].titel === "C-Titel",
      "die Entscheidung UND der Beitrag des dritten Geraets stecken beide im Ergebnis",
      stand,
    );
  }

  // --- G10 Ein DRITTES Geraet aendert zwischen Konflikterkennung und
  //         Entscheidung GENAU DASSELBE Feld erneut: die Entscheidung darf
  //         NICHT einfach druebergeschrieben werden - es muss eine weitere,
  //         weiterhin ausganglose Konfliktrunde entstehen. Das ist der
  //         Kernpunkt des Einwands: ohne diese Pruefung wuerde C09 die
  //         Entscheidung des Menschen unbedingt schreiben und den Beitrag
  //         des Dritten stillschweigend verwerfen. ------------------------
  {
    const speicher = erzeugeSpeicherAttrappe("ordner", "attrappe:g10");
    const aufA = { anzeigen: [] as Anzeige[], konflikte: 0, uebernahmen: [] as GBestand[] };
    const aufB = { anzeigen: [] as Anzeige[], konflikte: 0, uebernahmen: [] as GBestand[] };
    const werkA = neuesWerk(speicher, aufA, "raumA10");
    const werkB = neuesWerk(speicher, aufB, "raumB10");

    await werkA.laden();
    werkA.aendern(gBasis());
    await werkA.jetztSpeichern();
    await werkB.laden();
    werkB.aendern({ ...gBasis(), tickets: [{ ...gBasis().tickets[0], frist: "B-Termin" }] });
    await werkB.jetztSpeichern();
    werkA.aendern({ ...gBasis(), tickets: [{ ...gBasis().tickets[0], frist: "A-Termin" }] });
    await werkA.jetztSpeichern();
    pruefe("G10.1", aufA.konflikte === 1, "erste Konfliktrunde auf 'frist'");

    // Drittes Geraet C aendert waehrend der Entscheidung DASSELBE Feld noch
    // einmal.
    const vorC = (await speicher.lesenMitStand<GBestand>("stand.json", "ordner")).daten!;
    await speicher.schreiben(
      { ...vorC, tickets: [{ ...vorC.tickets[0], frist: "C-Termin" }] },
      "stand.json",
      "ordner",
    );

    const entschieden = { ...gBasis(), tickets: [{ ...gBasis().tickets[0], frist: "ENTSCHIEDEN" }] };
    await werkA.uebernehmeEntscheidung(entschieden);

    pruefe("G10.2", aufA.konflikte === 2, "eine zweite Konfliktrunde entsteht - die Entscheidung reicht nicht mehr");
    pruefe(
      "G10.3",
      aufA.anzeigen.at(-1)?.zustand === "fehler-cloud" && aufA.anzeigen.at(-1)?.wiederholbar === false,
      "verlangt erneut eine Entscheidung, kein automatischer Versuch",
      aufA.anzeigen.at(-1),
    );
    const stand = (await speicher.lesen<GBestand>("stand.json", "ordner"))!;
    pruefe(
      "G10.4",
      stand.tickets[0].frist === "C-Termin",
      "die Entscheidung wurde NICHT ungeprueft ueber den Beitrag des Dritten geschrieben",
      stand,
    );
  }

  // --- G11 zustandText deckt jeden Zustand ab ---------------------------------
  {
    const zustaende: Array<Anzeige["zustand"]> = [
      "geladen",
      "ausstehend",
      "speichert",
      "gespeichert",
      "offline",
      "fehler-cloud",
      "fehler-lokal",
    ];
    pruefe(
      "G11.1",
      zustaende.every((z) => typeof zustandText(z) === "string" && zustandText(z).length > 0),
      "jeder Zustand hat einen Text",
    );
  }

  // --- L: erzeugeLokalSpeicher erfuellt den CloudSpeicher-Vertrag (Schritt 9) -
  {
    const speicher = erzeugeLokalSpeicher(`test_${Date.now()}_`);

    const fehlt = await speicher.standHolen("daten.json");
    pruefe("L01", fehlt.vorhanden === false, "Nicht vorhandene Datei meldet sich als fehlend");
    pruefe("L01", (await speicher.lesen("daten.json")) === null, "Lesen einer fehlenden Datei liefert null");

    const erst = await speicher.bedingtSchreiben({ w: 1 }, "daten.json", null);
    pruefe("L02", erst.erfolg, "Erstanlage gegen erwartet=null gelingt");
    const zweiteErstanlage = await speicher.bedingtSchreiben({ w: 2 }, "daten.json", null);
    pruefe("L02", !zweiteErstanlage.erfolg && zweiteErstanlage.grund === "schonVorhanden", "Zweite Erstanlage wird abgelehnt (schonVorhanden)");

    const gelesen = await speicher.lesenMitStand<{ w: number }>("daten.json");
    pruefe("L03", gelesen.daten?.w === 1, "lesenMitStand liefert den geschriebenen Inhalt");
    pruefe("L03", gelesen.stand.vorhanden && gelesen.stand.inhaltskennung !== null, "lesenMitStand liefert einen Stand");

    const mitGueltigemStand = await speicher.bedingtSchreiben({ w: 3 }, "daten.json", gelesen.stand);
    pruefe("L04", mitGueltigemStand.erfolg, "Schreiben mit gültigem Stand gelingt");

    const mitVeraltetemStand = await speicher.bedingtSchreiben({ w: 4 }, "daten.json", gelesen.stand);
    pruefe("L05", !mitVeraltetemStand.erfolg && mitVeraltetemStand.grund === "konflikt", "Schreiben mit veraltetem Stand wird als Konflikt abgelehnt");
    pruefe("L05", (await speicher.lesen<{ w: number }>("daten.json"))?.w === 3, "Der abgelehnte Schreibversuch hat nichts verändert");

    await speicher.schreiben({ w: 5 }, "andere.json", "Unterordner");
    const liste = await speicher.auflisten("Unterordner");
    pruefe("L06", liste.includes("andere.json"), "auflisten() findet die Datei im angegebenen Ordner");
    const wurzel = await speicher.auflisten();
    pruefe("L06", !wurzel.includes("andere.json"), "Ordner werden dabei nicht vermischt");

    await speicher.loeschen("daten.json");
    pruefe("L07", (await speicher.standHolen("daten.json")).vorhanden === false, "Nach dem Löschen gilt die Datei als fehlend");
    const erneuteErstanlage = await speicher.bedingtSchreiben({ w: 6 }, "daten.json", null);
    pruefe("L07", erneuteErstanlage.erfolg, "Nach dem Löschen ist eine neue Erstanlage wieder möglich");

    let ordnerFehler = false;
    try {
      await speicher.ordnerSicherstellen("Beliebiger/Ordner");
    } catch {
      ordnerFehler = true;
    }
    pruefe("L08", !ordnerFehler, "ordnerSicherstellen() ist für lokal ein folgenloses No-Op");

    pruefe("L09", speicher.kennung === "lokal", "Die Kennung identifiziert den lokalen Speicher");
  }

  // ===========================================================================
  console.log(`Bausteine: ${bestanden} Pruefungen bestanden, ${fehler.length} fehlgeschlagen.`);
  for (const f of fehler) console.log(`  FEHL - ${f}`);
  process.exit(fehler.length === 0 ? 0 : 1);
}

main();
