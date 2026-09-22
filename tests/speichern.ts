// Prüfungen zum sicheren Speichern (Arbeitspunkt 2).
//
// Geprüft wird das Speicherwerk gegen eine nachgebildete Ablage. Die
// Nachbildung verhält sich absichtlich wie die echte OneDrive-Ablage: sie gibt
// bei jedem Speichern ein NEUES Objekt mit gleichem Inhalt zurück. Genau das
// hatte in der alten Fassung die Endlosschleife ausgelöst.
//
// Aufruf: npm run test:speichern

import { createEmptyDatabase, createTicket } from "../src/data/db";
import { Speicherwerk, type Anzeige, type Zwischenspeicher } from "../src/storage/speicherwerk";
import type { Repository, SaveOutcome } from "../src/storage/repository";
import { databaseEqual } from "../src/storage/sync";
import type { Database } from "../src/data/types";

let bestanden = 0;
const fehler: string[] = [];

function pruefe(id: string, bedingung: boolean, text: string) {
  if (bedingung) {
    bestanden += 1;
    console.log(`  OK   ${id}  ${text}`);
  } else {
    fehler.push(`${id}: ${text}`);
    console.log(`  FEHL ${id}  ${text}`);
  }
}

const kopie = (db: Database): Database => JSON.parse(JSON.stringify(db)) as Database;
const warte = (ms: number) => new Promise<void>((auf) => setTimeout(auf, ms));

function mitTicket(db: Database, titel: string): Database {
  return { ...db, tickets: [...db.tickets, createTicket(titel)] };
}

// ---------------------------------------------------------------- Nachbildungen

class TestAblage implements Repository {
  readonly id = "onedrive" as const;
  readonly label = "Testablage";
  stand: Database | null = null;
  aufrufe = 0;
  verzoegerungMs = 0;
  verhalten: "ok" | "netz" | "wirftFehler" = "ok";
  angemeldet = true;

  needsSignIn() {
    return false;
  }
  isSignedIn() {
    return this.angemeldet;
  }
  async signIn() {}
  async signOut() {}
  async init() {}

  async load(): Promise<Database | null> {
    return this.stand ? kopie(this.stand) : null;
  }

  async save(db: Database): Promise<SaveOutcome> {
    this.aufrufe += 1;
    if (this.verzoegerungMs > 0) await warte(this.verzoegerungMs);
    if (this.verhalten === "netz") return { status: "offline" };
    if (this.verhalten === "wirftFehler") throw new Error("Serverfehler 500");
    this.stand = kopie(db);
    // Absichtlich ein neues Objekt mit gleichem Inhalt - wie diffAndMerge.
    return { status: "gespeichert", db: kopie(db) };
  }

  async force(db: Database): Promise<void> {
    this.stand = kopie(db);
  }
}

class TestSpeicher implements Zwischenspeicher {
  inhalt: Database | null = null;
  basisStand: Database | null = null;
  beschreibbar = true;
  schreibversuche = 0;

  schreibe(db: Database): boolean {
    this.schreibversuche += 1;
    if (!this.beschreibbar) return false;
    this.inhalt = kopie(db);
    return true;
  }
  lies(): Database | null {
    return this.inhalt ? kopie(this.inhalt) : null;
  }
  leere(): void {
    this.inhalt = null;
  }
  basis(): Database | null {
    return this.basisStand ? kopie(this.basisStand) : null;
  }
}

interface Aufbau {
  ablage: TestAblage;
  speicher: TestSpeicher;
  werk: Speicherwerk;
  letzte: () => Anzeige;
  uebernommen: Database[];
}

function aufbau(): Aufbau {
  const ablage = new TestAblage();
  const speicher = new TestSpeicher();
  let anzeige: Anzeige = { zustand: "geladen", meldung: "", wiederholbar: false };
  const uebernommen: Database[] = [];
  const werk = new Speicherwerk(
    ablage,
    speicher,
    (a) => {
      anzeige = a;
    },
    (db) => {
      uebernommen.push(db);
    },
    () => {},
    { verzoegerungMs: 0 },
  );
  return { ablage, speicher, werk, letzte: () => anzeige, uebernommen };
}

// ---------------------------------------------------------------------- Tests

async function main() {
  console.log("\nP08 ToDo-Ticket – Prüfungen zum sicheren Speichern\n");

  // --- S01: Nach erfolgreichem Speichern endet die Aktivität --------------
  {
    const { ablage, speicher, werk, letzte } = aufbau();
    const db = mitTicket(createEmptyDatabase(), "Erster Eintrag");
    werk.aendern(db);
    await werk.ruhe();
    const nachErstem = ablage.aufrufe;
    await warte(30); // Zeit, in der eine Schleife weitergelaufen wäre
    pruefe("S01", nachErstem === 1, "Genau ein Speichervorgang für eine Änderung");
    pruefe("S01", ablage.aufrufe === 1, "Keine weiteren Vorgänge ohne neue Eingabe – keine Schleife");
    pruefe("S01", letzte().zustand === "gespeichert", "Zustand meldet gespeichert");
    pruefe("S01", speicher.inhalt === null, "Zwischenspeicher ist geleert");
  }

  // --- S02: Gleiche Antwort löst keinen weiteren Vorgang aus --------------
  {
    const { ablage, werk } = aufbau();
    const db = mitTicket(createEmptyDatabase(), "Unverändert");
    werk.aendern(db);
    await werk.ruhe();
    // Dieselbe Eingabe noch einmal, inhaltlich identisch, anderes Objekt
    werk.aendern(kopie(db));
    await werk.ruhe();
    pruefe("S02", ablage.aufrufe === 1, "Inhaltlich gleicher Stand wird nicht erneut gespeichert");
  }

  // --- S03: Eingaben während eines laufenden Speichervorgangs -------------
  {
    const { ablage, speicher, werk, letzte } = aufbau();
    ablage.verzoegerungMs = 40;
    const a = mitTicket(createEmptyDatabase(), "A");
    werk.aendern(a);
    await warte(10); // Speichern von A läuft
    const b = mitTicket(a, "B");
    werk.aendern(b);
    const c = mitTicket(b, "C");
    werk.aendern(c);
    pruefe("S03", speicher.inhalt !== null, "Während des Speicherns bleibt der Zwischenspeicher gefüllt");
    await werk.ruhe();
    pruefe("S03", ablage.stand !== null && ablage.stand.tickets.length === 3, "Alle drei Änderungen sind in der Ablage");
    pruefe("S03", databaseEqual(ablage.stand!, c), "Der gespeicherte Stand entspricht der letzten Eingabe");
    pruefe("S03", letzte().zustand === "gespeichert", "Erst am Ende wird gespeichert gemeldet");
    pruefe("S03", speicher.inhalt === null, "Zwischenspeicher wird erst nach vollständiger Sicherung geleert");
    pruefe("S03", ablage.aufrufe <= 3, `Vorgänge werden zusammengefasst (tatsächlich ${ablage.aufrufe})`);
  }

  // --- S04: Verspätete Antwort bestätigt keinen veralteten Stand ----------
  {
    const { ablage, speicher, werk, letzte } = aufbau();
    ablage.verzoegerungMs = 40;
    const a = mitTicket(createEmptyDatabase(), "A");
    werk.aendern(a);
    await warte(10);
    const b = mitTicket(a, "B");
    werk.aendern(b);
    await warte(45); // Antwort auf A ist jetzt da, B aber noch nicht gespeichert
    pruefe("S04", letzte().zustand !== "gespeichert", "Solange B aussteht, wird nicht gespeichert gemeldet");
    pruefe("S04", speicher.inhalt !== null, "Der Zwischenspeicher wird nicht vorzeitig geleert");
    await werk.ruhe();
    pruefe("S04", databaseEqual(ablage.stand!, b), "Am Ende liegt der neuere Stand in der Ablage");
  }

  // --- S05: Neu laden mit ausstehenden Änderungen -------------------------
  {
    // 5a: nur lokal etwas vorhanden
    {
      const { speicher, werk } = aufbau();
      const lokal = mitTicket(createEmptyDatabase(), "Nur lokal erfasst");
      speicher.inhalt = kopie(lokal);
      const ergebnis = await werk.laden();
      pruefe(
        "S05a",
        ergebnis.art === "stand" && ergebnis.db !== null && ergebnis.db.tickets.length === 1,
        "Ungesicherte lokale Eingabe überlebt das Neuladen",
      );
    }
    // 5b: lokal und Ablage inhaltsgleich
    {
      const { ablage, speicher, werk } = aufbau();
      const stand = mitTicket(createEmptyDatabase(), "Gleich");
      speicher.inhalt = kopie(stand);
      ablage.stand = kopie(stand);
      const ergebnis = await werk.laden();
      pruefe("S05b", ergebnis.art === "stand", "Gleicher Inhalt wird übernommen");
      pruefe("S05b", speicher.inhalt === null, "Zwischenspeicher wird dabei geleert");
    }
    // 5c: beide verändert, gemeinsame Ausgangsfassung vorhanden
    {
      const { ablage, speicher, werk } = aufbau();
      const basis = mitTicket(createEmptyDatabase(), "Gemeinsam");
      const lokal = mitTicket(basis, "Lokal ergänzt");
      const fern = mitTicket(basis, "In der Ablage ergänzt");
      speicher.basisStand = kopie(basis);
      speicher.inhalt = kopie(lokal);
      ablage.stand = kopie(fern);
      const ergebnis = await werk.laden();
      const zusammen = ergebnis.art === "stand" ? ergebnis.db! : null;
      pruefe("S05c", zusammen !== null && zusammen.tickets.length === 3, "Beide Ergänzungen bleiben erhalten");
      pruefe(
        "S05c",
        zusammen !== null && zusammen.tickets.some((t) => t.title === "Lokal ergänzt"),
        "Die ungesicherte lokale Eingabe geht nicht verloren",
      );
    }
    // 5d: beide verändert, keine gemeinsame Ausgangsfassung
    {
      const { ablage, speicher, werk } = aufbau();
      speicher.inhalt = kopie(mitTicket(createEmptyDatabase(), "Lokal"));
      ablage.stand = kopie(mitTicket(createEmptyDatabase(), "Ablage"));
      const ergebnis = await werk.laden();
      pruefe("S05d", ergebnis.art === "entscheidung", "Ohne Ausgangsfassung wird nichts still überschrieben");
      pruefe("S05d", speicher.inhalt !== null, "Der lokale Stand bleibt dabei erhalten");
    }
  }

  // --- S06: Netzwerkfehler ------------------------------------------------
  {
    const { ablage, speicher, werk, letzte } = aufbau();
    ablage.verhalten = "netz";
    const db = mitTicket(createEmptyDatabase(), "Bei Funkloch erfasst");
    werk.aendern(db);
    await werk.ruhe();
    pruefe("S06", letzte().zustand === "offline", "Netzwerkfehler wird als offline gemeldet");
    pruefe("S06", letzte().wiederholbar, "Ein erneuter Versuch wird angeboten");
    pruefe("S06", speicher.inhalt !== null, "Die Eingabe bleibt lokal gesichert");

    // S07: erneuter Versuch nach Behebung
    ablage.verhalten = "ok";
    await werk.jetztSpeichern();
    pruefe("S07", letzte().zustand === "gespeichert", "Nach dem erneuten Versuch ist gespeichert");
    pruefe("S07", databaseEqual(ablage.stand!, db), "Arbeitsstand und gespeicherter Stand stimmen überein");
    pruefe("S07", speicher.inhalt === null, "Zwischenspeicher ist danach geleert");
  }

  // --- S08: Serverfehler --------------------------------------------------
  {
    const { ablage, speicher, werk, letzte } = aufbau();
    ablage.verhalten = "wirftFehler";
    werk.aendern(mitTicket(createEmptyDatabase(), "Fehlerfall"));
    await werk.ruhe();
    pruefe("S08", letzte().zustand === "fehler-cloud", "Serverfehler wird als Speicherfehler gemeldet");
    pruefe("S08", letzte().meldung.includes("500"), "Die Fehlermeldung nennt die Ursache");
    pruefe("S08", speicher.inhalt !== null, "Die Eingabe bleibt lokal gesichert");
  }

  // --- S09: lokaler Speicher nicht beschreibbar ---------------------------
  {
    const { speicher, werk, letzte } = aufbau();
    speicher.beschreibbar = false;
    werk.aendern(mitTicket(createEmptyDatabase(), "Privates Fenster"));
    pruefe("S09", letzte().zustand === "fehler-lokal", "Gescheiterte lokale Sicherung wird gemeldet, nicht verschwiegen");
    pruefe("S09", letzte().meldung.length > 0, "Der Hinweis benennt die Lage");
    await werk.ruhe();
    pruefe("S09", letzte().zustand === "gespeichert", "Die Ablage wird trotzdem beschrieben");
  }

  // --- S10: Zusammengeführter Stand wird übernommen, ohne Schleife --------
  {
    const ablage = new TestAblage();
    const speicher = new TestSpeicher();
    let anzeige: Anzeige = { zustand: "geladen", meldung: "", wiederholbar: false };
    const uebernommen: Database[] = [];
    // Diese Ablage ergänzt beim Speichern einen fremden Eintrag - wie ein
    // Abgleich, der Änderungen eines anderen Geräts einbringt.
    const ergaenzende: Repository = {
      ...ablage,
      id: "onedrive",
      label: "Ergänzende Ablage",
      needsSignIn: () => false,
      isSignedIn: () => true,
      signIn: async () => {},
      signOut: async () => {},
      init: async () => {},
      load: async () => null,
      force: async () => {},
      save: async (db: Database) => {
        ablage.aufrufe += 1;
        const ergaenzt = ablage.aufrufe === 1 ? mitTicket(db, "Vom anderen Gerät") : kopie(db);
        ablage.stand = kopie(ergaenzt);
        return { status: "gespeichert", db: kopie(ergaenzt) };
      },
    };
    const werk = new Speicherwerk(
      ergaenzende,
      speicher,
      (a) => {
        anzeige = a;
      },
      (db) => uebernommen.push(db),
      () => {},
      { verzoegerungMs: 0 },
    );
    werk.aendern(mitTicket(createEmptyDatabase(), "Eigener Eintrag"));
    await werk.ruhe();
    await warte(20);
    pruefe("S10", uebernommen.length === 1, "Der zusammengeführte Stand wird genau einmal übernommen");
    pruefe("S10", anzeige.zustand === "gespeichert", "Danach ist der Zustand gespeichert");
    pruefe("S10", ablage.aufrufe <= 2, `Der Abgleich kommt zur Ruhe (${ablage.aufrufe} Vorgänge)`);
    pruefe("S10", speicher.inhalt === null, "Zwischenspeicher ist geleert");
  }

  console.log(`\n${bestanden} Prüfungen bestanden, ${fehler.length} fehlgeschlagen.`);
  if (fehler.length > 0) {
    for (const f of fehler) console.log(`  ! ${f}`);
    process.exit(1);
  }
}

void main();
