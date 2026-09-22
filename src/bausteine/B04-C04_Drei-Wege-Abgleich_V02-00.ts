// =============================================================================
// B04-C04  Drei-Wege-Abgleich (baseline / lokal / entfernt), FELDGENAU
// -----------------------------------------------------------------------------
// Fassung   : V02-00
// Stand     : 2026-09-19, 08:41
// Herkunft  : B04-C04 V01-00 (zeilengenau, aus P03_Packliste V04-04) und
//             P08_ToDo-Ticket, src/storage/sync.ts (feldgenau, erprobt)
// Sprache   : TypeScript, keine fremden Bibliotheken
//
// WARUM V02-00 UND NICHT V01-01
// Der Vertrag bricht an drei Stellen: `konflikte` enthaelt jetzt FELD-Konflikte
// statt Zeilenkonflikte, es kommt eine zweite Liste `zeilenKonflikte` dazu, und
// `applyConflictResolutions` nimmt andere Schluessel entgegen. Wer V01-00
// verwendet, kann diese Fassung nicht ohne Aenderung einsetzen.
//
// WAS SICH GEGENUEBER V01-00 INHALTLICH AENDERT - drei Punkte
//
// 1. FELDGENAU STATT ZEILENGENAU.
//    V01-00 verglich ganze Zeilen und meldete einen Konflikt, sobald beide
//    Seiten dieselbe Zeile angefasst hatten - auch wenn sie VERSCHIEDENE
//    Felder geaendert hatten. Bei zwei Geraeten ist das der Regelfall, nicht
//    die Ausnahme: am PC die Frist, am Laptop den Lead desselben Tickets.
//    Jetzt: unterschiedliche Felder werden zusammengefuehrt, vorgelegt wird
//    nur DASSELBE Feld mit unterschiedlichem Wert.
//
// 2. KEIN STILLER VERLUST AUSSERHALB DER TABELLEN.
//    V01-00 begann mit `const ergebnis = { ...lokal }`. Jeder Schluessel, der
//    weder in `tabellen` noch in `vereinigen` genannt war, uebernahm damit
//    kommentarlos den lokalen Wert - die entfernte Aenderung war weg, ohne
//    Meldung und ohne Konflikt. In P08 betraf das `meta`. Das stand in den
//    Grenzen des Bausteins nicht und ist der eigentliche Grund fuer diese
//    Fassung.
//    Jetzt: solche Schluessel durchlaufen dieselbe Drei-Wege-Regel. Sind alle
//    drei Staende einfache Objekte, geschieht das Feld fuer Feld.
//
// 3. LOESCHEN WIRD ORDENTLICH BEHANDELT.
//    Eine Zeile, die entfernt geloescht und lokal geaendert wurde (oder
//    umgekehrt), ist ein echter Konflikt und keine Rechenaufgabe. Sie
//    erscheint in `zeilenKonflikte`, wo eine Seite `null` ist. Eine Zeile, die
//    nur auf einer Seite geloescht und auf der anderen nicht angefasst wurde,
//    verschwindet und wird gemeldet.
//
// DIE REGEL, IN EINEM SATZ
//   nur eine Seite hat seit der baseline etwas geaendert -> diese Aenderung
//   gilt; haben beide Seiten dieselbe Stelle unterschiedlich geaendert ->
//   der Mensch entscheidet, je Stelle. Es gibt keinen Sammelknopf.
//
// Fuer den Offline-Fall gilt dasselbe: eine offline gesammelte Aenderung ist
// aus Sicht dieses Bausteins nichts anderes als eine lokale Aenderung.
//
// VERTRAG (aendert sich nur mit VV)
//   stableStringify(wert)                            -> string
//   inhaltGleich(a, b)                               -> boolean
//   bestandGleich(a, b, schluessel)                  -> boolean
//   diffAndMerge(baseline, lokal, entfernt, opt)     -> AbgleichErgebnis
//   konfliktSchluessel(konflikt)                     -> string
//   applyConflictResolutions(ergebnis, wahl)         -> Datenbestand
//
// GRENZEN
//   - Jede Zeile braucht ein eindeutiges Feld `id`.
//   - Verglichen wird auf Feldebene, nicht INNERHALB eines Feldes. Aendern
//     zwei Geraete verschiedene Stellen desselben Fliesstextes, ist das ein
//     Konflikt - und das soll es auch sein.
//   - Die Reihenfolge der Zeilen im Ergebnis ist nicht garantiert.
//   - `vereinigen` ist fuer reine Mengen gedacht. Ein dort genannter Schluessel
//     kann nichts verlieren, aber auch nichts zurueckgenommen bekommen: was
//     einmal auf einer Seite drin war, bleibt drin.
// =============================================================================

export type Zeile = Record<string, unknown> & { id: string };
export type Datenbestand = Record<string, unknown>;

/** Dieselbe Stelle wurde auf beiden Seiten unterschiedlich geaendert. */
export interface FeldKonflikt {
  art: "feld";
  tabelle: string;
  /** Leer, wenn der Konflikt nicht in einer Zeile, sondern in einem
   *  eigenstaendigen Schluessel des Bestands liegt (z. B. `meta`). */
  id: string;
  feld: string;
  label: string;
  lokal: unknown;
  entfernt: unknown;
}

/** Eine Seite hat die Zeile geloescht, die andere geaendert. */
export interface ZeilenKonflikt {
  art: "zeile";
  tabelle: string;
  id: string;
  label: string;
  lokal: Zeile | null;
  entfernt: Zeile | null;
}

export type Konflikt = FeldKonflikt | ZeilenKonflikt;

export interface UebernommeneAenderung {
  tabelle: string;
  id: string;
  art: "hinzugefügt" | "geändert" | "entfernt";
  label: string;
  herkunft: "lokal" | "entfernt";
}

export interface AbgleichErgebnis<T extends Datenbestand = Datenbestand> {
  /** Stand nach Uebernahme aller NICHT strittigen Aenderungen. An strittigen
   *  Stellen steht vorlaeufig der lokale Wert, bis der Mensch entschieden hat. */
  zusammengefuehrt: T;
  konflikte: FeldKonflikt[];
  zeilenKonflikte: ZeilenKonflikt[];
  uebernommen: UebernommeneAenderung[];
}

export interface AbgleichOptionen {
  /** Die Schluessel im Datenbestand, die Zeilenlisten enthalten. */
  tabellen: string[];
  /** Erzeugt die Beschriftung einer Zeile. Ohne Angabe: "tabelle/id". */
  beschreibe?: (tabelle: string, zeile: Zeile) => string;
  /** Schluessel, die nicht verglichen, sondern vereinigt werden (reine Mengen). */
  vereinigen?: string[];
  /** Felder, die beim Vergleich ausgenommen bleiben - z. B. ein `updatedAt`,
   *  das sich bei jeder Aenderung mitbewegt und sonst jeden Feldkonflikt
   *  verdoppeln wuerde. Der lokale Wert gilt. */
  feldAusnehmen?: (tabelle: string, feld: string) => boolean;
  /**
   * Wie eine Tabelle zu lesen ist, die in einem Stand GAR NICHT VORKOMMT.
   *
   * "unveraendert" (Vorgabe): diese Seite hat die Tabelle nicht angefasst - es
   *   gilt der Stand der baseline. Das schuetzt vor dem schlimmsten Fall: eine
   *   Datei, die eine aeltere Programmfassung ohne diese Tabelle geschrieben
   *   hat, wuerde sonst als "alle Zeilen geloescht" gelesen und loeschte den
   *   ganzen Bestand. Wer wirklich alles loescht, schreibt eine leere Liste,
   *   nicht gar nichts.
   * "leer": fehlende Tabelle heisst leere Tabelle (Verhalten von V01-00).
   */
  fehlendeTabelle?: "unveraendert" | "leer";
}

// -----------------------------------------------------------------------------
// Vergleich, unabhaengig von der Reihenfolge der Objektfelder
// -----------------------------------------------------------------------------

export function stableStringify(wert: unknown): string {
  if (wert === null || typeof wert !== "object") return JSON.stringify(wert) ?? "null";
  if (Array.isArray(wert)) return `[${wert.map(stableStringify).join(",")}]`;
  const obj = wert as Record<string, unknown>;
  const schluessel = Object.keys(obj).sort();
  return `{${schluessel.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** Schneller Inhaltsvergleich - z. B. um zu pruefen, ob ueberhaupt etwas zu
 *  speichern ist, bevor unnoetig in die Cloud geschrieben wird. */
export function inhaltGleich(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

/** Vergleicht zwei Bestaende ueber die angegebenen Schluessel. */
export function bestandGleich(a: Datenbestand, b: Datenbestand, schluessel: string[]): boolean {
  return schluessel.every((k) => inhaltGleich(a[k], b[k]));
}

function alsKarte(zeilen: Zeile[]): Map<string, Zeile> {
  const karte = new Map<string, Zeile>();
  for (const z of zeilen) karte.set(z.id, z);
  return karte;
}

function istEinfachesObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === "object" && wert !== null && !Array.isArray(wert);
}

// -----------------------------------------------------------------------------
// Der Abgleich
// -----------------------------------------------------------------------------

export function diffAndMerge<T extends Datenbestand>(
  baseline: T,
  lokal: T,
  entfernt: T,
  optionen: AbgleichOptionen,
): AbgleichErgebnis<T> {
  const beschreibe =
    optionen.beschreibe ?? ((tabelle: string, zeile: Zeile) => `${tabelle}/${zeile.id}`);
  const ausnehmen = optionen.feldAusnehmen ?? (() => false);
  const konflikte: FeldKonflikt[] = [];
  const zeilenKonflikte: ZeilenKonflikt[] = [];
  const uebernommen: UebernommeneAenderung[] = [];
  const ergebnis: Record<string, unknown> = {};

  const vereinigen = new Set(optionen.vereinigen ?? []);
  const tabellen = new Set(optionen.tabellen);

  // ---------------------------------------------------------------- Tabellen
  const fehlendAlsLeer = optionen.fehlendeTabelle === "leer";
  /** Liest eine Tabelle aus einem Stand; fehlt sie, entscheidet die Option. */
  function tabelleAus(stand: Datenbestand, tabelle: string): Zeile[] {
    const wert = stand[tabelle];
    if (Array.isArray(wert)) return wert as Zeile[];
    if (fehlendAlsLeer) return [];
    const ausBaseline = baseline[tabelle];
    return Array.isArray(ausBaseline) ? (ausBaseline as Zeile[]) : [];
  }

  for (const tabelle of optionen.tabellen) {
    const basis = alsKarte((baseline[tabelle] as Zeile[]) ?? []);
    const eigen = alsKarte(tabelleAus(lokal, tabelle));
    const fremd = alsKarte(tabelleAus(entfernt, tabelle));
    const alleIds = new Set<string>([...basis.keys(), ...eigen.keys(), ...fremd.keys()]);
    const zusammen: Zeile[] = [];

    for (const id of alleIds) {
      const b = basis.get(id) ?? null;
      const l = eigen.get(id) ?? null;
      const f = fremd.get(id) ?? null;

      // --- Zeile fehlt auf einer oder beiden Seiten --------------------------
      if (!l && !f) continue; // beidseitig geloescht - nichts zu tun

      if (l && !f) {
        if (!b) {
          // lokal neu angelegt
          zusammen.push(l);
          uebernommen.push({
            tabelle,
            id,
            art: "hinzugefügt",
            label: beschreibe(tabelle, l),
            herkunft: "lokal",
          });
        } else if (inhaltGleich(b, l)) {
          // entfernt geloescht, lokal nicht angefasst -> loeschen
          uebernommen.push({
            tabelle,
            id,
            art: "entfernt",
            label: beschreibe(tabelle, b),
            herkunft: "entfernt",
          });
        } else {
          // entfernt geloescht UND lokal geaendert -> der Mensch entscheidet
          zusammen.push(l);
          zeilenKonflikte.push({
            art: "zeile",
            tabelle,
            id,
            label: beschreibe(tabelle, l),
            lokal: l,
            entfernt: null,
          });
        }
        continue;
      }

      if (f && !l) {
        if (!b) {
          zusammen.push(f);
          uebernommen.push({
            tabelle,
            id,
            art: "hinzugefügt",
            label: beschreibe(tabelle, f),
            herkunft: "entfernt",
          });
        } else if (inhaltGleich(b, f)) {
          // lokal geloescht, entfernt nicht angefasst -> loeschen
          uebernommen.push({
            tabelle,
            id,
            art: "entfernt",
            label: beschreibe(tabelle, b),
            herkunft: "lokal",
          });
        } else {
          // lokal geloescht UND entfernt geaendert
          zeilenKonflikte.push({
            art: "zeile",
            tabelle,
            id,
            label: beschreibe(tabelle, f),
            lokal: null,
            entfernt: f,
          });
          // vorlaeufig gilt die lokale Sicht: die Zeile bleibt geloescht
        }
        continue;
      }

      // --- Zeile auf beiden Seiten vorhanden --------------------------------
      const eigeneZeile = l!;
      const fremdeZeile = f!;

      if (inhaltGleich(eigeneZeile, fremdeZeile)) {
        zusammen.push(eigeneZeile);
        continue;
      }
      if (b && inhaltGleich(b, eigeneZeile)) {
        // nur entfernt geaendert
        zusammen.push(fremdeZeile);
        uebernommen.push({
          tabelle,
          id,
          art: "geändert",
          label: beschreibe(tabelle, fremdeZeile),
          herkunft: "entfernt",
        });
        continue;
      }
      if (b && inhaltGleich(b, fremdeZeile)) {
        // nur lokal geaendert
        zusammen.push(eigeneZeile);
        continue;
      }

      // beide Seiten geaendert: Feld fuer Feld pruefen
      const zusammengefuehrt = feldweise(
        tabelle,
        id,
        beschreibe(tabelle, eigeneZeile),
        b,
        eigeneZeile,
        fremdeZeile,
        ausnehmen,
        konflikte,
      ) as Zeile;
      zusammengefuehrt.id = id;
      zusammen.push(zusammengefuehrt);
    }

    ergebnis[tabelle] = zusammen;
  }

  // ------------------------------------------------------------- vereinigen
  for (const schluessel of vereinigen) {
    const a = (lokal[schluessel] as unknown[]) ?? [];
    const b = (entfernt[schluessel] as unknown[]) ?? [];
    ergebnis[schluessel] = Array.from(new Set([...a, ...b]));
  }

  // --------------------------------------------------- alle uebrigen Schluessel
  // V01-00 setzte hier still den lokalen Wert. Das ist der behobene Fehler.
  const uebrige = new Set<string>([
    ...Object.keys(baseline),
    ...Object.keys(lokal),
    ...Object.keys(entfernt),
  ]);
  for (const schluessel of uebrige) {
    if (tabellen.has(schluessel) || vereinigen.has(schluessel)) continue;
    const bw = baseline[schluessel];
    // Auch hier gilt: ein Schluessel, den ein Stand gar nicht kennt, wurde von
    // dieser Seite nicht angefasst. Sonst wuerde eine Datei aus einer aelteren
    // Programmfassung z. B. `meta` loeschen.
    const lw = schluessel in lokal ? lokal[schluessel] : bw;
    const fw = schluessel in entfernt ? entfernt[schluessel] : bw;

    if (inhaltGleich(lw, fw)) {
      ergebnis[schluessel] = lw;
      continue;
    }
    if (inhaltGleich(bw, lw)) {
      ergebnis[schluessel] = fw; // nur entfernt geaendert
      uebernommen.push({
        tabelle: schluessel,
        id: "",
        art: "geändert",
        label: schluessel,
        herkunft: "entfernt",
      });
      continue;
    }
    if (inhaltGleich(bw, fw)) {
      ergebnis[schluessel] = lw; // nur lokal geaendert
      continue;
    }
    // Beide Seiten geaendert. Sind alle drei Staende einfache Objekte, geht es
    // Feld fuer Feld weiter - so bleibt z. B. `meta` vollstaendig erhalten.
    if (istEinfachesObjekt(bw) && istEinfachesObjekt(lw) && istEinfachesObjekt(fw)) {
      ergebnis[schluessel] = feldweise(
        schluessel,
        "",
        schluessel,
        bw,
        lw,
        fw,
        ausnehmen,
        konflikte,
      );
      continue;
    }
    // Sonst: vorlaeufig lokal, aber gemeldet - nicht still.
    ergebnis[schluessel] = lw;
    konflikte.push({
      art: "feld",
      tabelle: schluessel,
      id: "",
      feld: schluessel,
      label: schluessel,
      lokal: lw,
      entfernt: fw,
    });
  }

  return { zusammengefuehrt: ergebnis as T, konflikte, zeilenKonflikte, uebernommen };
}

/** Fuehrt zwei Objekte feldgenau zusammen und sammelt die strittigen Felder. */
function feldweise(
  tabelle: string,
  id: string,
  label: string,
  basis: Record<string, unknown> | null,
  eigen: Record<string, unknown>,
  fremd: Record<string, unknown>,
  ausnehmen: (tabelle: string, feld: string) => boolean,
  sammler: FeldKonflikt[],
): Record<string, unknown> {
  const ergebnis: Record<string, unknown> = { ...fremd };
  const felder = new Set([...Object.keys(eigen), ...Object.keys(fremd)]);

  for (const feld of felder) {
    if (feld === "id") {
      ergebnis[feld] = eigen[feld] ?? fremd[feld];
      continue;
    }
    const lw = eigen[feld];
    const fw = fremd[feld];
    if (inhaltGleich(lw, fw)) {
      ergebnis[feld] = lw;
      continue;
    }
    if (ausnehmen(tabelle, feld)) {
      ergebnis[feld] = lw; // bewusst ausgenommen: der lokale Wert gilt
      continue;
    }
    const bw = basis ? basis[feld] : undefined;
    if (basis && inhaltGleich(bw, fw)) {
      ergebnis[feld] = lw; // nur lokal geaendert
      continue;
    }
    if (basis && inhaltGleich(bw, lw)) {
      ergebnis[feld] = fw; // nur entfernt geaendert
      continue;
    }
    // strittig: vorlaeufig der lokale Wert, bis entschieden ist
    ergebnis[feld] = lw;
    sammler.push({ art: "feld", tabelle, id, feld, label, lokal: lw, entfernt: fw });
  }
  return ergebnis;
}

// -----------------------------------------------------------------------------
// Entscheidungen einarbeiten
// -----------------------------------------------------------------------------

/** Schluessel eines Konflikts fuer die Entscheidungsliste.
 *  Feld:  "tabelle|id|feld"      Zeile: "tabelle|id" */
export function konfliktSchluessel(konflikt: Konflikt): string {
  return konflikt.art === "feld"
    ? `${konflikt.tabelle}|${konflikt.id}|${konflikt.feld}`
    : `${konflikt.tabelle}|${konflikt.id}`;
}

/**
 * Arbeitet die Entscheidungen des Menschen in den Vorschlag ein.
 * Ohne Eintrag gilt "lokal" - das ist genau der Stand, der im Vorschlag
 * ohnehin schon steht.
 */
export function applyConflictResolutions<T extends Datenbestand>(
  ergebnis: AbgleichErgebnis<T>,
  wahl: Map<string, "lokal" | "entfernt">,
): T {
  const daten = { ...ergebnis.zusammengefuehrt } as Record<string, unknown>;

  // --- Feldkonflikte -------------------------------------------------------
  for (const konflikt of ergebnis.konflikte) {
    const entscheidung = wahl.get(konfliktSchluessel(konflikt)) ?? "lokal";
    const wert = entscheidung === "lokal" ? konflikt.lokal : konflikt.entfernt;

    if (konflikt.id === "") {
      // Konflikt ausserhalb einer Tabelle
      const vorhanden = daten[konflikt.tabelle];
      if (konflikt.feld === konflikt.tabelle) {
        daten[konflikt.tabelle] = wert;
      } else if (istEinfachesObjekt(vorhanden)) {
        daten[konflikt.tabelle] = { ...vorhanden, [konflikt.feld]: wert };
      }
      continue;
    }

    const zeilen = [...((daten[konflikt.tabelle] as Zeile[]) ?? [])];
    const stelle = zeilen.findIndex((z) => z.id === konflikt.id);
    if (stelle === -1) continue;
    zeilen[stelle] = { ...zeilen[stelle], [konflikt.feld]: wert };
    daten[konflikt.tabelle] = zeilen;
  }

  // --- Zeilenkonflikte (geloescht gegen geaendert) -------------------------
  for (const konflikt of ergebnis.zeilenKonflikte) {
    const entscheidung = wahl.get(konfliktSchluessel(konflikt)) ?? "lokal";
    const gewaehlt = entscheidung === "lokal" ? konflikt.lokal : konflikt.entfernt;
    const zeilen = ((daten[konflikt.tabelle] as Zeile[]) ?? []).filter((z) => z.id !== konflikt.id);
    if (gewaehlt) zeilen.push(gewaehlt);
    daten[konflikt.tabelle] = zeilen;
  }

  return daten as T;
}
