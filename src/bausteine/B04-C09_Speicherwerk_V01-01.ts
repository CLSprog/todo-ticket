// =============================================================================
// B04-C09  Speicherwerk (geordnetes Speichern gegen eine Cloud-Ablage)
// -----------------------------------------------------------------------------
// Fassung   : V01-01
// Stand     : 2026-09-22
// Herkunft  : V01-00 vom selben Tag. Vertragsbruch gegenueber V01-00, deshalb
//             VV: `uebernehmeEntscheidung()` schrieb dort UNBEDINGT. Ein
//             drittes Geraet, das zwischen dem Oeffnen des Konfliktdialogs und
//             dem Klick auf "Uebernehmen & speichern" schreibt, wurde
//             kommentarlos ueberschrieben - vom Baustein selbst genau die
//             Luecke, die C01 V02-00 an anderer Stelle schliesst (siehe
//             P08_Antwort-C01-Einwand V01-00). uebernehmeEntscheidung() laeuft
//             jetzt durch denselben bedingten Ablauf wie ein normaler
//             Speichervorgang (lauf() ueber C08 nacheinander()): Ablehnung
//             fuehrt zu erneutem Lesen, Abgleich ueber C04 und - falls dabei
//             neue Feld- oder Zeilenkonflikte entstehen - zu einer erneuten,
//             weiterhin ausganglosen Runde bei `beiKonflikt`. Bereits vom
//             Menschen entschiedene Felder werden dabei nicht noch einmal
//             gefragt, nur die durch den Dritten neu betroffenen.
// Sprache   : TypeScript, keine fremden Bibliotheken
//
// WAS DIESER BAUSTEIN LEISTET
// Beantwortet vier Fragen, die in einer Oberflaeche sonst verstreut und leicht
// falsch beantwortet werden:
//   1. Was ist der neueste Stand?              -> neuesterStand (intern)
//   2. Was liegt nachweislich in der Ablage?    -> standDerAblage
//   3. Laeuft gerade ein Speichervorgang?        -> ueber melde()
//   4. Ist der lokale Zwischenspeicher in Ordnung? -> ueber melde()
//
// GRUNDREGELN (aus Arbeitspunkt 2, dort erprobt - unveraendert gueltig)
// - Jede Eingabe wird SOFORT lokal gesichert, nicht verzoegert. Schlaegt das
//   fehl, wird das gemeldet und nicht beschoenigt (C05).
// - "Gespeichert" wird nur gemeldet, wenn der neueste Stand INHALTLICH dem
//   entspricht, was die Ablage bestaetigt hat (C04 `inhaltGleich`).
//
// WAS SICH GEGENUEBER Arbeitspunkt 2 AENDERT - und warum das der eigentliche
// Zweck dieses Bausteins ist
//
// 1. NIE MEHR ZWEI NACHBAUTEN STATT DER BAUSTEINE.
//    speicherwerk.ts schrieb seine eigene Lauf-Sperre (eine `laeuft`-Variable)
//    und benutzte P08s eigenes `Repository` statt einer austauschbaren
//    Cloud-Speicher-Schnittstelle. Jetzt: die Sperre ist C08 `nacheinander()`,
//    die Ablage ist C01 `CloudSpeicher`, der Zwischenspeicher ist C05
//    `Zwischenspeicher<T>`, der Abgleich ist C04 `diffAndMerge` - generisch
//    ueber `tabellen`, nicht auf P08s acht Sammlungen festverdrahtet.
//
// 2. DAS SCHREIBEN IST JETZT WIRKLICH BEDINGT.
//    Arbeitspunkt 2 verglich vor dem Schreiben nur gegen die eigene, lokal
//    gemerkte Ausgangsfassung und schrieb dann UNBEDINGT (einfaches PUT). Das
//    ist der schwerste Befund aus der Bausteinpruefung vom 19.09. (C01-1):
//    zwischen dem Vergleich und dem Schreiben blieb ein Fenster, in dem ein
//    zweites Geraet unbemerkt dazwischenschreiben konnte - der aeltere Stand
//    ging dann still verloren. Jetzt schreibt C09 ausschliesslich ueber C01
//    `bedingtSchreiben()`: der Speicher selbst lehnt ab, wenn sich sein Stand
//    seit dem letzten Lesen geaendert hat. Erst eine Ablehnung loest den
//    Abgleich aus - nicht mehr ein rein lokaler Verdacht.
//
// 3. NACH EINER ABLEHNUNG WIRD ABGEGLICHEN, NICHT AUFGEGEBEN.
//    Lehnt die Ablage das Schreiben ab, liest C09 den tatsaechlichen Stand neu,
//    fuehrt ueber C04 zusammen und versucht es erneut - hoechstens
//    `maxDurchgaenge` mal. Nur echte Feld- oder Zeilenkonflikte gehen an
//    `beiKonflikt` und damit an den Menschen.
//
// WAS APP-SPEZIFISCH BLEIBT (siehe P08_Bausteinzuordnung-Arbeitspunkt-3)
// Der Baustein kennt den ABLAUF, nicht die BEDEUTUNG. Er liefert einen
// Zustand als Datenstruktur zurueck; der Wortlaut der Anzeige ("lokal
// gesichert" gegen "in der Cloud gespeichert") ist Sache der App - nur sie
// weiss, welcher Speicher gerade verwendet wird. `zustandText()` unten ist
// deshalb nur ein brauchbarer Standard, keine Vorgabe.
//
// VERTRAG (aendert sich nur mit VV)
//   new Speicherwerk(speicher, cache, melde, uebernimm, beiKonflikt, optionen)
//   .laden()                    -> Promise<LadeErgebnis<T>>
//   .aendern(db)                -> void
//   .jetztSpeichern()           -> Promise<void>
//   .uebernehmeEntscheidung(db) -> Promise<void>
//   .ruhe()                     -> Promise<void>
//   .standDerAblage             -> T | null
//
// GRENZEN
//   - Wie C08: die Sperre gilt nur innerhalb EINES Tabs bzw. einer
//     Node-Instanz - siehe dort.
//   - `optionen` reicht `tabellen`/`vereinigen`/`feldAusnehmen`/
//     `fehlendeTabelle`/`beschreibe` unveraendert an C04 durch. Der Baustein
//     kennt das Datenmodell der App nicht von sich aus.
//   - Ohne `bereit()` gilt der Speicher immer als einsatzbereit. Eine App mit
//     Anmeldung (B04-C02) muss das selbst pruefen und uebergeben.
//   - Zwischen einer Ablehnung und dem naechsten Anlauf liegt keine Wartezeit
//     und kein Netz-Rueckruf (`online`-Ereignis) - das kommt erst mit den
//     Geraete- und Speicherortwechsel-Anforderungen (Schritt 7).
// =============================================================================

import type { CloudSpeicher, Speicherstand } from "./B04-C01_Cloud-Speicher_V02-00";
import {
  applyConflictResolutions as _applyConflictResolutions,
  diffAndMerge,
  inhaltGleich,
  type AbgleichOptionen,
  type Datenbestand,
  type FeldKonflikt,
  type ZeilenKonflikt,
} from "./B04-C04_Drei-Wege-Abgleich_V02-00";
import type { Zwischenspeicher } from "./B04-C05_Offline-Warteschlange_V01-01";
import { istVerbindungsfehler } from "./B04-C05_Offline-Warteschlange_V01-01";
import { nacheinander } from "./B04-C08_Speichersperre_V01-00";

// Re-exportiert, damit eine App nach einer Benutzerentscheidung nicht
// zusaetzlich C04 direkt importieren muss.
export { _applyConflictResolutions as applyConflictResolutions };

export type Speicherzustand =
  | "geladen"
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

export type LadeErgebnis<T extends Datenbestand> =
  | { art: "stand"; db: T | null; quelle: "ablage" | "lokal" | "leer" }
  /** Ungesicherte lokale Aenderungen treffen auf einen abweichenden Stand in
   *  der Ablage, ohne gemeinsame Ausgangsfassung. Nichts wird still
   *  ueberschrieben - der Benutzer entscheidet. */
  | { art: "entscheidung"; lokal: T; fern: T }
  | { art: "konflikt"; merged: T; konflikte: FeldKonflikt[]; zeilenKonflikte: ZeilenKonflikt[] }
  | { art: "fehler"; meldung: string };

export interface SpeicherwerkOptionen extends AbgleichOptionen {
  /** Datei- und ggf. Ordnername in der Ablage (an C01 weitergereicht). */
  datei: string;
  ordner?: string;
  /** Wartezeit vor dem Speichern in die Ablage. 0 in Tests. */
  verzoegerungMs?: number;
  /** Notbremse gegen endlose Abgleichschleifen. */
  maxDurchgaenge?: number;
  /** Ist die Ablage gerade einsatzbereit (z. B. angemeldet, siehe B04-C02)?
   *  Ohne Angabe gilt sie immer als bereit. */
  bereit?: () => boolean;
}

/** Steuert einen Durchgang der Warteschlange (C08 nacheinander()): entweder
 *  der normale automatische Ablauf, oder das Durchsetzen einer vom Menschen
 *  getroffenen Entscheidung. Beide teilen sich dieselbe Reihe, damit keiner
 *  dem anderen ins Wort faellt. */
type Durchgangsmodus<T> = { art: "normal" } | { art: "entscheidung"; db: T };

export class Speicherwerk<T extends Datenbestand> {
  private neuesterStand: T | null = null;
  private gespeicherterStand: T | null = null;
  private gespeicherterCloudStand: Speicherstand | null = null;
  /** Der fremde Stand, auf dem eine gerade anstehende oder zuletzt
   *  getroffene Entscheidung beruht - nicht die aeltere gemeinsame
   *  Ausgangsfassung. Gesetzt beim Erkennen eines Konflikts (laden() oder
   *  lauf()), verbraucht und geloescht in laufEntscheidung(). */
  private fernBeiKonflikt: T | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private wartende: (() => void)[] = [];
  private amLaufen = false;
  private lokalOk = true;
  private readonly verzoegerungMs: number;
  private readonly maxDurchgaenge: number;
  private readonly einDurchgang: (modus: Durchgangsmodus<T>) => Promise<void>;

  constructor(
    private readonly speicher: CloudSpeicher,
    private readonly cache: Zwischenspeicher<T>,
    private readonly melde: (anzeige: Anzeige) => void,
    /** Wird aufgerufen, wenn ein zusammengefuehrter Stand zu uebernehmen ist. */
    private readonly uebernimm: (db: T) => void,
    private readonly beiKonflikt: (
      merged: T,
      konflikte: FeldKonflikt[],
      zeilenKonflikte: ZeilenKonflikt[],
    ) => void,
    private readonly optionen: SpeicherwerkOptionen,
  ) {
    this.verzoegerungMs = optionen.verzoegerungMs ?? 800;
    this.maxDurchgaenge = optionen.maxDurchgaenge ?? 5;
    // C08: Anlaeufe reihen sich, statt einander zu verwerfen - keiner geht
    // verloren, auch nicht einer, der waehrend eines laufenden Durchgangs
    // ausgeloest wird. Beide Modi (automatisch und Entscheidung) teilen sich
    // dieselbe Reihe, damit z. B. ein automatischer Speicherversuch nicht
    // gleichzeitig mit dem Durchsetzen einer Entscheidung laeuft.
    this.einDurchgang = nacheinander((modus: Durchgangsmodus<T>) =>
      modus.art === "normal" ? this.lauf() : this.laufEntscheidung(modus.db),
    );
  }

  // ------------------------------------------------------------------ Laden

  /** Laedt und fuehrt dabei ungesicherte lokale Aenderungen mit der Ablage
   *  zusammen, statt sie zu ueberschreiben. */
  async laden(): Promise<LadeErgebnis<T>> {
    const offen = this.cache.ausstehendLesen(this.optionen.datei);
    let gelesen: { daten: T | null; stand: Speicherstand };
    try {
      gelesen = await this.speicher.lesenMitStand<T>(this.optionen.datei, this.optionen.ordner);
    } catch (error) {
      // Ein Ladefehler darf einen vorhandenen lokalen Stand nicht vernichten.
      if (offen) {
        this.neuesterStand = offen;
        this.setze(
          "fehler-cloud",
          `Laden fehlgeschlagen: ${String(error)}. Der lokale Arbeitsstand bleibt erhalten.`,
          true,
        );
        return { art: "stand", db: offen, quelle: "lokal" };
      }
      return { art: "fehler", meldung: `Laden fehlgeschlagen: ${String(error)}` };
    }

    const fern = gelesen.daten;
    this.gespeicherterCloudStand = gelesen.stand;

    if (!fern && !offen) return { art: "stand", db: null, quelle: "leer" };

    if (!fern && offen) {
      // Ablage ist leer, lokal liegt etwas - das gehoert hochgeschrieben.
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
    if (inhaltGleich(offen!, fern!)) {
      this.cache.ausstehendLoeschen(this.optionen.datei);
      this.gespeicherterStand = fern!;
      this.neuesterStand = fern!;
      this.setze("gespeichert", "");
      return { art: "stand", db: fern, quelle: "ablage" };
    }

    const basis = this.cache.baselineLesen(this.optionen.datei);
    if (basis) {
      const ergebnis = diffAndMerge(basis, offen!, fern!, this.optionen);
      if (ergebnis.konflikte.length > 0 || ergebnis.zeilenKonflikte.length > 0) {
        this.setze("fehler-cloud", "Änderungen von zwei Geräten müssen entschieden werden.", false);
        return {
          art: "konflikt",
          merged: ergebnis.zusammengefuehrt,
          konflikte: ergebnis.konflikte,
          zeilenKonflikte: ergebnis.zeilenKonflikte,
        };
      }
      this.gespeicherterStand = fern!;
      this.neuesterStand = ergebnis.zusammengefuehrt;
      this.setze("ausstehend", "Ungesicherte Änderungen wurden mit der Ablage zusammengeführt.", true);
      return { art: "stand", db: ergebnis.zusammengefuehrt, quelle: "lokal" };
    }

    // Ohne gemeinsame Ausgangsfassung ist kein verlaesslicher Abgleich moeglich.
    // Die Entscheidung des Menschen wird spaeter gegen GENAU DIESEN fremden
    // Stand durchgesetzt (siehe laufEntscheidung) - nicht unbedingt.
    this.fernBeiKonflikt = fern!;
    this.setze("fehler-cloud", "Ungesicherte Änderungen und ein abweichender Stand in der Ablage.", false);
    return { art: "entscheidung", lokal: offen!, fern: fern! };
  }

  // --------------------------------------------------------------- Aendern

  /** Bei jeder uebernommenen Eingabe aufrufen. Sichert sofort lokal und plant
   *  die Speicherung in die Ablage. */
  aendern(db: T): void {
    this.neuesterStand = db;
    this.lokalOk = this.cache.ausstehendSchreiben(this.optionen.datei, db);

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

    if (this.gespeicherterStand && inhaltGleich(db, this.gespeicherterStand)) {
      // Inhaltlich identisch mit dem, was die Ablage bestaetigt hat.
      this.cache.ausstehendLoeschen(this.optionen.datei);
      this.setze("gespeichert", "");
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
    await this.einDurchgang({ art: "normal" });
  }

  /** Uebernimmt einen vom Benutzer entschiedenen Stand als verbindlich.
   *  Schreibt UEBER C01 bedingtSchreiben() gegen den fremden Stand, auf dem
   *  die Entscheidung beruht (fernBeiKonflikt) - nicht mehr unbedingt (siehe
   *  Fassungshinweis am Dateikopf). Hat inzwischen ein drittes Geraet
   *  geschrieben, wird NICHT ueberschrieben: bereits entschiedene Felder
   *  bleiben entschieden, nur was der Dritte zusaetzlich geaendert hat, geht
   *  ueber `beiKonflikt` in eine weitere - weiterhin ausganglose - Runde. */
  async uebernehmeEntscheidung(db: T): Promise<void> {
    this.neuesterStand = db;
    this.cache.ausstehendSchreiben(this.optionen.datei, db);
    await this.einDurchgang({ art: "entscheidung", db });
  }

  /** Wartet, bis kein Speichervorgang mehr laeuft und keiner geplant ist. */
  async ruhe(): Promise<void> {
    if (!this.amLaufen && !this.timer) return;
    await new Promise<void>((auf) => this.wartende.push(auf));
  }

  get standDerAblage(): T | null {
    return this.gespeicherterStand;
  }

  // ------------------------------------------------------------- intern

  private plane(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.einDurchgang({ art: "normal" });
    }, this.verzoegerungMs);
  }

  private async lauf(): Promise<void> {
    this.amLaufen = true;
    try {
      for (let durchgang = 0; durchgang < this.maxDurchgaenge; durchgang += 1) {
        const stand = this.neuesterStand;
        if (!stand) break;
        if (this.gespeicherterStand && inhaltGleich(stand, this.gespeicherterStand)) {
          this.cache.ausstehendLoeschen(this.optionen.datei);
          this.setze("gespeichert", "");
          break;
        }
        if (this.optionen.bereit && !this.optionen.bereit()) {
          this.setze("ausstehend", "Ablage nicht einsatzbereit – Änderungen sind lokal gesichert und warten.", true);
          break;
        }

        this.setze("speichert", "");
        let ergebnis;
        try {
          ergebnis = await this.speicher.bedingtSchreiben(
            stand,
            this.optionen.datei,
            this.gespeicherterCloudStand,
            this.optionen.ordner,
          );
        } catch (error) {
          if (istVerbindungsfehler(error)) {
            this.setze("offline", "Offline – Änderungen sind lokal gesichert und werden nachgereicht.", true);
          } else {
            this.setze("fehler-cloud", `Speichern fehlgeschlagen: ${String(error)}`, true);
          }
          break;
        }

        if (ergebnis.erfolg) {
          // Erfolgreich geschrieben. Ab hier gilt `stand` als Stand der Ablage.
          this.gespeicherterCloudStand = ergebnis.stand;
          this.gespeicherterStand = stand;

          if (inhaltGleich(this.neuesterStand!, stand)) {
            if (this.lokalOk) this.cache.ausstehendLoeschen(this.optionen.datei);
            this.cache.baselineSchreiben(this.optionen.datei, stand);
            this.setze("gespeichert", "");
            break;
          }
          // Waehrend des Speicherns kamen neue Eingaben. Zwischenspeicher
          // bleibt bestehen, es folgt ein weiterer Durchgang.
          this.setze("ausstehend", "");
          if (durchgang === this.maxDurchgaenge - 1) {
            this.setze("fehler-cloud", "Der Abgleich kommt nicht zur Ruhe. Bitte erneut versuchen.", true);
          }
          continue;
        }

        // Kein Erfolg: jemand anders hat seit dem gemerkten Stand geschrieben
        // (oder die Datei gab es beim Erstschreiben schon). Neu lesen und ueber
        // C04 abgleichen, statt blind zu ueberschreiben oder aufzugeben.
        let frisch: { daten: T | null; stand: Speicherstand };
        try {
          frisch = await this.speicher.lesenMitStand<T>(this.optionen.datei, this.optionen.ordner);
        } catch (error) {
          this.setze("fehler-cloud", `Abgleich nach Konflikt fehlgeschlagen: ${String(error)}`, true);
          break;
        }
        this.gespeicherterCloudStand = frisch.stand;
        const fern = frisch.daten;

        if (!fern) {
          // Datei ist inzwischen weg (geloescht): als leeren Ausgangsstand
          // behandeln, der eigene Stand gilt im naechsten Durchgang.
          continue;
        }

        const basis = this.gespeicherterStand ?? this.cache.baselineLesen(this.optionen.datei) ?? fern;
        const abgleich = diffAndMerge(basis, stand, fern, this.optionen);
        if (abgleich.konflikte.length > 0 || abgleich.zeilenKonflikte.length > 0) {
          // Die Entscheidung wird spaeter (uebernehmeEntscheidung) gegen
          // GENAU DIESEN fremden Stand durchgesetzt, nicht gegen die aeltere
          // Ausgangsfassung - sonst wuerde jede Entscheidung sofort wieder
          // als Konflikt gegen sich selbst erscheinen.
          this.fernBeiKonflikt = fern;
          this.beiKonflikt(abgleich.zusammengefuehrt, abgleich.konflikte, abgleich.zeilenKonflikte);
          this.setze("fehler-cloud", "Änderungen von zwei Geräten müssen entschieden werden.", false);
          break;
        }

        // Konfliktfrei zusammengefuehrt: als neuen Stand uebernehmen und im
        // naechsten Durchgang erneut versuchen zu schreiben.
        this.neuesterStand = abgleich.zusammengefuehrt;
        this.uebernimm(abgleich.zusammengefuehrt);
        this.cache.ausstehendSchreiben(this.optionen.datei, abgleich.zusammengefuehrt);
        if (durchgang === this.maxDurchgaenge - 1) {
          this.setze("fehler-cloud", "Der Abgleich kommt nicht zur Ruhe. Bitte erneut versuchen.", true);
        }
      }
    } finally {
      this.amLaufen = false;
      this.wecke();
    }
  }

  /** Setzt eine vom Menschen getroffene Entscheidung gegen die Ablage durch.
   *  Erster Versuch ueber C01 bedingtSchreiben() gegen `fernBeiKonflikt` (den
   *  fremden Stand, auf dem die Entscheidung beruht). Schlaegt das fehl, hat
   *  ein DRITTES Geraet seither geschrieben - `fernBeiKonflikt` ist dann
   *  nicht mehr die Grundlage, sondern selbst schon veraltet. Deshalb wird
   *  NICHT gegen die aeltere gemeinsame Ausgangsfassung abgeglichen (das
   *  wuerde jedes bereits entschiedene Feld erneut als Konflikt zeigen),
   *  sondern gegen genau den Stand, den die Entscheidung zugrunde gelegt hat:
   *  unveraenderte Felder werden vom Dritten stillschweigend uebernommen,
   *  entschiedene Felder bleiben entschieden, nur ein Feld, das der Dritte
   *  ERNEUT angefasst hat, loest eine neue - weiterhin ausganglose - Runde
   *  bei `beiKonflikt` aus. */
  private async laufEntscheidung(db: T): Promise<void> {
    this.amLaufen = true;
    try {
      let stand = db;
      let basis = this.fernBeiKonflikt ?? this.gespeicherterStand ?? db;

      for (let durchgang = 0; durchgang < this.maxDurchgaenge; durchgang += 1) {
        this.setze("speichert", "");
        let ergebnis;
        try {
          ergebnis = await this.speicher.bedingtSchreiben(
            stand,
            this.optionen.datei,
            this.gespeicherterCloudStand,
            this.optionen.ordner,
          );
        } catch (error) {
          if (istVerbindungsfehler(error)) {
            this.setze("offline", "Offline – Entscheidung ist lokal gesichert und wird nachgereicht.", true);
          } else {
            this.setze("fehler-cloud", `Speichern fehlgeschlagen: ${String(error)}`, true);
          }
          return;
        }

        if (ergebnis.erfolg) {
          this.gespeicherterCloudStand = ergebnis.stand;
          this.gespeicherterStand = stand;
          this.neuesterStand = stand;
          this.fernBeiKonflikt = null;
          this.cache.baselineSchreiben(this.optionen.datei, stand);
          this.cache.ausstehendLoeschen(this.optionen.datei);
          this.setze("gespeichert", "");
          return;
        }

        // Abgelehnt: seit `basis` hat ein drittes Geraet geschrieben. Frisch
        // lesen und NUR gegen diesen Stand abgleichen, nicht gegen die
        // Entscheidung selbst.
        let frisch: { daten: T | null; stand: Speicherstand };
        try {
          frisch = await this.speicher.lesenMitStand<T>(this.optionen.datei, this.optionen.ordner);
        } catch (error) {
          this.setze("fehler-cloud", `Abgleich nach Konflikt fehlgeschlagen: ${String(error)}`, true);
          return;
        }
        this.gespeicherterCloudStand = frisch.stand;
        const fernJetzt = frisch.daten;

        if (!fernJetzt) {
          // Datei ist inzwischen weg: die Entscheidung gilt unveraendert,
          // naechster Durchgang schreibt sie als Erstanlage.
          continue;
        }

        const abgleich = diffAndMerge(basis, stand, fernJetzt, this.optionen);
        if (abgleich.konflikte.length > 0 || abgleich.zeilenKonflikte.length > 0) {
          this.fernBeiKonflikt = fernJetzt;
          this.beiKonflikt(abgleich.zusammengefuehrt, abgleich.konflikte, abgleich.zeilenKonflikte);
          this.setze("fehler-cloud", "Ein weiteres Gerät hat inzwischen geschrieben – bitte erneut entscheiden.", false);
          return;
        }

        // Konfliktfrei: was der Dritte zusaetzlich geaendert hat, uebernehmen
        // und mit demselben, weiterhin gueltigen Stand erneut versuchen.
        stand = abgleich.zusammengefuehrt;
        basis = fernJetzt;
        this.neuesterStand = stand;
        this.cache.ausstehendSchreiben(this.optionen.datei, stand);
        if (durchgang === this.maxDurchgaenge - 1) {
          this.setze("fehler-cloud", "Der Abgleich kommt nicht zur Ruhe. Bitte erneut versuchen.", true);
        }
      }
    } finally {
      this.amLaufen = false;
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

/** Beschriftung fuer die Statuszeile - ein brauchbarer Standard, keine
 *  Vorgabe. Die genaue Formulierung (z. B. "lokal" gegen "in der Cloud")
 *  kennt nur die App - siehe Kopf dieser Datei, Abschnitt "app-spezifisch". */
export function zustandText(zustand: Speicherzustand): string {
  switch (zustand) {
    case "geladen":
      return "geladen";
    case "ausstehend":
      return "gesichert, Speicherung ausstehend";
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
