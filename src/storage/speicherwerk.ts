// Geordnetes Speichern.
//
// Dieses Modul ist bewusst frei von React, damit sein Verhalten prüfbar ist
// (siehe tests/speichern.ts). Es beantwortet vier Fragen, die vorher in der
// Oberfläche verstreut und fehlerhaft beantwortet waren:
//
//   1. Was ist der neueste Stand?          -> neuesterStand
//   2. Was liegt nachweislich in der Ablage? -> gespeicherterStand
//   3. Läuft gerade ein Speichervorgang?     -> laeuft
//   4. Ist der lokale Zwischenspeicher in Ordnung? -> lokalOk
//
// Grundregeln:
// - Jede Eingabe wird SOFORT lokal gesichert, nicht verzögert. Schlägt das
//   fehl, wird das gemeldet und nicht beschönigt.
// - Es läuft immer höchstens ein Speichervorgang. Weitere Eingaben sind
//   währenddessen erlaubt; sie werden danach in einem weiteren Durchgang
//   gespeichert.
// - "Gespeichert" wird nur gemeldet, wenn der neueste Stand INHALTLICH dem
//   entspricht, was die Ablage bestätigt hat. Erst dann wird der lokale
//   Zwischenspeicher geleert.
// - Der Vergleich läuft über den Inhalt (databaseEqual), nicht über die
//   Objektidentität. Ein Abgleich, der ein neues Objekt mit gleichem Inhalt
//   zurückgibt, löst deshalb keinen weiteren Speichervorgang aus.

import type { Database } from "../data/types";
import { databaseEqual, diffAndMerge, type FieldConflict } from "./sync";
import type { Repository } from "./repository";

export type Speicherzustand =
  | "geladen"
  | "lokal"
  | "ausstehend"
  | "speichert"
  | "gespeichert"
  | "offline"
  | "fehler-cloud"
  | "fehler-lokal";

export interface Anzeige {
  zustand: Speicherzustand;
  meldung: string;
  /** true, wenn ein erneuter Versuch sinnvoll ist. */
  wiederholbar: boolean;
}

/** Der lokale Zwischenspeicher, als Schnittstelle, damit Tests ihn ersetzen
 *  und Fehlerfälle (voller Speicher) nachstellen können. */
export interface Zwischenspeicher {
  /** false = Sicherung fehlgeschlagen. */
  schreibe(db: Database): boolean;
  lies(): Database | null;
  leere(): void;
  basis(): Database | null;
}

export type LadeErgebnis =
  | { art: "stand"; db: Database | null; quelle: "ablage" | "lokal" | "leer" }
  /** Ungesicherte lokale Änderungen treffen auf einen abweichenden Stand in
   *  der Ablage, ohne gemeinsame Ausgangsfassung. Nichts wird still
   *  überschrieben - der Benutzer entscheidet. */
  | { art: "entscheidung"; lokal: Database; fern: Database }
  | { art: "konflikt"; merged: Database; conflicts: FieldConflict[] }
  | { art: "fehler"; meldung: string };

export interface Optionen {
  /** Wartezeit vor dem Speichern in die Ablage. 0 in Tests. */
  verzoegerungMs?: number;
  /** Notbremse gegen endlose Abgleichschleifen. */
  maxDurchgaenge?: number;
}

export class Speicherwerk {
  private neuesterStand: Database | null = null;
  private gespeicherterStand: Database | null = null;
  private laeuft = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private wartende: (() => void)[] = [];
  private lokalOk = true;
  private readonly verzoegerungMs: number;
  private readonly maxDurchgaenge: number;

  constructor(
    private readonly repo: Repository,
    private readonly cache: Zwischenspeicher,
    private readonly melde: (anzeige: Anzeige) => void,
    /** Wird aufgerufen, wenn ein zusammengeführter Stand zu übernehmen ist. */
    private readonly uebernimm: (db: Database) => void,
    private readonly beiKonflikt: (merged: Database, conflicts: FieldConflict[]) => void,
    optionen: Optionen = {},
  ) {
    this.verzoegerungMs = optionen.verzoegerungMs ?? 800;
    this.maxDurchgaenge = optionen.maxDurchgaenge ?? 5;
  }

  // ------------------------------------------------------------------ Laden

  /** Lädt und führt dabei ungesicherte lokale Änderungen mit der Ablage
   *  zusammen, statt sie zu überschreiben. */
  async laden(): Promise<LadeErgebnis> {
    const offen = this.cache.lies();
    let fern: Database | null = null;
    try {
      fern = await this.repo.load();
    } catch (error) {
      // Ein Ladefehler darf einen vorhandenen lokalen Stand nicht vernichten.
      if (offen) {
        this.neuesterStand = offen;
        this.setze("fehler-cloud", `Laden fehlgeschlagen: ${String(error)}. Der lokale Arbeitsstand bleibt erhalten.`, true);
        return { art: "stand", db: offen, quelle: "lokal" };
      }
      return { art: "fehler", meldung: `Laden fehlgeschlagen: ${String(error)}` };
    }

    if (!fern && !offen) return { art: "stand", db: null, quelle: "leer" };

    if (!fern && offen) {
      // Ablage ist leer, lokal liegt etwas - das gehört hochgeschrieben.
      this.neuesterStand = offen;
      this.setze("ausstehend", "Lokale Änderungen sind noch nicht in der Ablage.", true);
      return { art: "stand", db: offen, quelle: "lokal" };
    }

    if (fern && !offen) {
      this.gespeicherterStand = fern;
      this.neuesterStand = fern;
      this.setze("gespeichert", "");
      return { art: "stand", db: fern, quelle: "ablage" };
    }

    // Beides vorhanden.
    if (databaseEqual(offen!, fern!)) {
      this.cache.leere();
      this.gespeicherterStand = fern!;
      this.neuesterStand = fern!;
      this.setze("gespeichert", "");
      return { art: "stand", db: fern, quelle: "ablage" };
    }

    const basis = this.cache.basis();
    if (basis) {
      const { merged, conflicts } = diffAndMerge(basis, offen!, fern!);
      if (conflicts.length > 0) {
        this.setze("fehler-cloud", "Änderungen von zwei Geräten müssen entschieden werden.", false);
        return { art: "konflikt", merged, conflicts };
      }
      this.gespeicherterStand = fern!;
      this.neuesterStand = merged;
      this.setze("ausstehend", "Ungesicherte Änderungen wurden mit der Ablage zusammengeführt.", true);
      return { art: "stand", db: merged, quelle: "lokal" };
    }

    // Ohne gemeinsame Ausgangsfassung ist kein verlässlicher Abgleich möglich.
    this.setze("fehler-cloud", "Ungesicherte Änderungen und ein abweichender Stand in der Ablage.", false);
    return { art: "entscheidung", lokal: offen!, fern: fern! };
  }

  // --------------------------------------------------------------- Ändern

  /** Bei jeder übernommenen Eingabe aufrufen. Sichert sofort lokal und plant
   *  die Speicherung in die Ablage. */
  aendern(db: Database): void {
    this.neuesterStand = db;
    this.lokalOk = this.cache.schreibe(db);

    if (!this.lokalOk) {
      this.setze(
        "fehler-lokal",
        "Der lokale Zwischenspeicher ist nicht beschreibbar. Änderungen sind bis zur nächsten erfolgreichen Speicherung nur im Arbeitsspeicher.",
        true,
      );
      // Trotzdem versuchen, in die Ablage zu schreiben - das ist dann der
      // einzige sichere Ort.
      this.plane();
      return;
    }

    if (this.gespeicherterStand && databaseEqual(db, this.gespeicherterStand)) {
      // Inhaltlich identisch mit dem, was die Ablage bestaetigt hat.
      this.cache.leere();
      this.setze(this.repo.id === "local" ? "lokal" : "gespeichert", "");
      return;
    }

    this.setze("ausstehend", "");
    this.plane();
  }

  /** Erneuter Versuch nach einem Fehler, oder Speichern ohne Wartezeit. */
  async jetztSpeichern(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.lauf();
  }

  /** Übernimmt einen vom Benutzer entschiedenen Stand als verbindlich. */
  async uebernehmeEntscheidung(db: Database): Promise<void> {
    this.neuesterStand = db;
    this.cache.schreibe(db);
    try {
      await this.repo.force(db);
      this.gespeicherterStand = db;
      this.cache.leere();
      this.setze("gespeichert", "");
    } catch (error) {
      this.setze("fehler-cloud", `Speichern fehlgeschlagen: ${String(error)}`, true);
    }
  }

  /** Wartet, bis kein Speichervorgang mehr läuft und keiner geplant ist. */
  async ruhe(): Promise<void> {
    if (!this.laeuft && !this.timer) return;
    await new Promise<void>((auf) => this.wartende.push(auf));
  }

  get standDerAblage(): Database | null {
    return this.gespeicherterStand;
  }

  // ------------------------------------------------------------- intern

  private plane(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.lauf();
    }, this.verzoegerungMs);
  }

  private async lauf(): Promise<void> {
    // Läuft schon einer: der holt den neueren Stand in seinem nächsten
    // Durchgang selbst ab. Kein zweiter Vorgang, keine überholenden Antworten.
    if (this.laeuft) return;
    this.laeuft = true;

    try {
      for (let durchgang = 0; durchgang < this.maxDurchgaenge; durchgang += 1) {
        const stand = this.neuesterStand;
        if (!stand) break;
        if (this.gespeicherterStand && databaseEqual(stand, this.gespeicherterStand)) {
          this.cache.leere();
          this.setze(this.repo.id === "local" ? "lokal" : "gespeichert", "");
          break;
        }
        if (this.repo.needsSignIn() && !this.repo.isSignedIn()) {
          this.setze("ausstehend", "Nicht angemeldet – Änderungen sind lokal gesichert und warten.", true);
          break;
        }

        this.setze("speichert", "");
        let ergebnis;
        try {
          ergebnis = await this.repo.save(stand);
        } catch (error) {
          this.setze("fehler-cloud", `Speichern fehlgeschlagen: ${String(error)}`, true);
          break;
        }

        if (ergebnis.status === "offline") {
          this.setze("offline", "Offline – Änderungen sind lokal gesichert und werden nachgereicht.", true);
          break;
        }
        if (ergebnis.status === "konflikt") {
          this.beiKonflikt(ergebnis.merged, ergebnis.conflicts);
          this.setze("fehler-cloud", "Änderungen von zwei Geräten müssen entschieden werden.", false);
          break;
        }

        // Erfolgreich geschrieben. Ab hier gilt ergebnis.db als Stand der Ablage.
        this.gespeicherterStand = ergebnis.db;

        // Hat der Abgleich fremde Änderungen eingebracht, müssen sie in die
        // Oberfläche. Inhaltsvergleich, nicht Objektvergleich - ein neues
        // Objekt mit gleichem Inhalt darf nichts auslösen.
        if (!databaseEqual(ergebnis.db, stand)) {
          this.neuesterStand = ergebnis.db;
          this.uebernimm(ergebnis.db);
        }

        if (databaseEqual(this.neuesterStand!, ergebnis.db)) {
          // Der neueste Stand liegt nachweislich in der Ablage.
          if (this.lokalOk) this.cache.leere();
          this.setze(this.repo.id === "local" ? "lokal" : "gespeichert", "");
          break;
        }

        // Während des Speicherns kamen neue Eingaben. Zwischenspeicher bleibt
        // bestehen, es folgt ein weiterer Durchgang.
        this.setze("ausstehend", "");
        if (durchgang === this.maxDurchgaenge - 1) {
          this.setze("fehler-cloud", "Der Abgleich kommt nicht zur Ruhe. Bitte erneut versuchen.", true);
        }
      }
    } finally {
      this.laeuft = false;
      this.wecke();
    }
  }

  private wecke(): void {
    if (this.timer) return;
    const warteschlange = this.wartende;
    this.wartende = [];
    for (const auf of warteschlange) auf();
  }

  private setze(zustand: Speicherzustand, meldung: string, wiederholbar = false): void {
    this.melde({ zustand, meldung, wiederholbar });
  }
}

/** Beschriftung für die Statuszeile. */
export function zustandText(zustand: Speicherzustand): string {
  switch (zustand) {
    case "geladen":
      return "geladen";
    case "lokal":
      return "lokal gesichert";
    case "ausstehend":
      return "lokal gesichert, Speicherung ausstehend";
    case "speichert":
      return "speichert …";
    case "gespeichert":
      return "gespeichert";
    case "offline":
      return "offline, lokal gesichert";
    case "fehler-cloud":
      return "nicht gespeichert";
    case "fehler-lokal":
      return "lokale Sicherung fehlgeschlagen";
  }
}
