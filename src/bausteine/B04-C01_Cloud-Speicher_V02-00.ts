// =============================================================================
// B04-C01  Cloud-Speicher (lesen / schreiben / auflisten / loeschen / Ordner)
// -----------------------------------------------------------------------------
// Fassung   : V02-00
// Stand     : 2026-09-19, 08:41
// Herkunft  : B04-C01 V01-00 vom 2026-09-07 (aus P03_Packliste V04-04,
//             src/onedrive.ts). Diese Fassung erweitert den Vertrag, deshalb VV.
// Sprache   : TypeScript, keine fremden Bibliotheken
//
// WAS GEGENUEBER V01-00 NEU IST - und warum es ein Vertragsbruch ist
// V01-00 schrieb UNBEDINGT: wer zuletzt schreibt, gewinnt. Aendern zwei Geraete
// dieselbe Datei, ohne dazwischen abzugleichen, ist der aeltere Stand still
// verloren. Fuer P08 gilt aber "nie ueberschreiben".
//
// Neu im Vertrag (deshalb muss jede Umsetzung nachgezogen werden -> V02-00):
//   kennung            identifiziert Speicher UND Konto. Wird von C03 und C05
//                      als Namensraum fuer lokale Schluessel gebraucht, damit
//                      ein Speicher- oder Kontowechsel nicht alte Merker erbt.
//   standHolen()       liefert die Inhaltskennung einer Datei, ohne sie zu laden
//   lesenMitStand()    liest Inhalt UND Kennung in einem Zug
//   bedingtSchreiben() schreibt nur, wenn sich seit dem gemerkten Stand
//                      nichts geaendert hat
//
// WARUM ZWEI RIEGEL UND NICHT NUR If-Match
// Geprueft am 2026-09-19 (siehe P08_Graph-Befund bedingtes Schreiben V01-00):
// Microsoft Graph dokumentiert fuer PUT .../content NUR Authorization und
// Content-Type. If-Match ist dort weder zugesagt noch ausgeschlossen; im
// Issue-Tracker der Graph-Doku wird beides berichtet (ignoriert / unerwartetes
// 412). Auf einen undokumentierten Kopf darf sich Datensicherheit nicht
// stuetzen. Deshalb:
//   Riegel 1 (tragend)   vor dem Schreiben den Stand holen und die
//                        Inhaltskennung vergleichen
//   Riegel 2 (Zugabe)    If-Match trotzdem mitschicken; 412 gilt als Konflikt
// EHRLICH DAZUGESAGT: zwischen Riegel 1 und dem PUT bleibt ein Fenster von
// Sekundenbruchteilen. Das ist eine sehr gute Erkennung, kein Sperrverfahren.
// Fuer zwei Geraete eines einzelnen Menschen reicht das; ein echtes Sperren
// gaebe es nur ueber eine zusaetzliche Sperrdatei, und die bringt verwaiste
// Sperren nach einem Absturz mit.
//
// WELCHE KENNUNG VERGLICHEN WIRD
// Graph liefert zwei: eTag aendert sich auch bei Metadatenaenderungen (z. B.
// Umbenennen), cTag nur bei Inhaltsaenderungen. Fuer "hat jemand anders die
// DATEN geaendert?" ist cTag richtig. Verglichen wird deshalb cTag; fuer
// If-Match wird eTag mitgeschickt, weil der Kopf sich auf eTag bezieht.
//
// GRENZEN (unveraendert aus V01-00, plus eine neue)
//   - auflisten() holt eine Einzelseite (bis 200 Eintraege), keine Pagination.
//   - ordnerSicherstellen legt nur die LETZTE Ebene an.
//   - Inhalte werden als JSON uebertragen; Binaerdateien kann der Baustein nicht.
//   - NEU: bedingtSchreiben kostet einen zusaetzlichen Aufruf (Stand holen).
//     Wer bewusst ueberschreiben will, nimmt weiterhin schreiben().
// =============================================================================

/** Stand einer Datei im Speicher, so weit er von aussen sichtbar ist. */
export interface Speicherstand {
  /** Datei ist vorhanden. */
  vorhanden: boolean;
  /** Kennung des INHALTS. Aendert sich, sobald jemand die Daten geaendert hat.
   *  Bei Graph: cTag. null, wenn die Datei fehlt oder der Speicher keine liefert. */
  inhaltskennung: string | null;
  /** Kennung fuer If-Match. Bei Graph: eTag. null, wenn nicht verfuegbar. */
  etag: string | null;
}

export const STAND_FEHLT: Speicherstand = { vorhanden: false, inhaltskennung: null, etag: null };

export interface GelesenerStand<T> {
  daten: T | null;
  stand: Speicherstand;
}

export type SchreibGrund =
  /** Erfolgreich geschrieben. */
  | "geschrieben"
  /** Jemand anders hat die Datei seit dem erwarteten Stand geaendert. */
  | "konflikt"
  /** Beim ersten Schreiben: die Datei war schon da. */
  | "schonVorhanden";

export interface SchreibErgebnis {
  erfolg: boolean;
  grund: SchreibGrund;
  /** Bei Erfolg der neue Stand, bei Konflikt der vorgefundene fremde Stand. */
  stand: Speicherstand;
}

export interface CloudSpeicher {
  /** Identifiziert Speicher UND Konto. Namensraum fuer lokale Merker (C03, C05).
   *  Muss sich aendern, sobald ein anderes Konto oder ein anderer Speicher
   *  verwendet wird - sonst erben die lokalen Merker fremde Staende. */
  readonly kennung: string;

  lesen<T = unknown>(datei: string, ordner?: string): Promise<T | null>;
  lesenMitStand<T = unknown>(datei: string, ordner?: string): Promise<GelesenerStand<T>>;
  standHolen(datei: string, ordner?: string): Promise<Speicherstand>;

  /** Unbedingt schreiben. Ueberschreibt, was auch immer dort steht. */
  schreiben(inhalt: unknown, datei: string, ordner?: string): Promise<void>;

  /**
   * Schreibt nur, wenn der Speicher noch auf `erwartet` steht.
   * `erwartet = null` heisst "die Datei darf es noch nicht geben".
   * Kein Fehlerwurf bei Konflikt - der Aufrufer bekommt ein Ergebnis und
   * entscheidet (abgleichen, fragen, verwerfen).
   */
  bedingtSchreiben(
    inhalt: unknown,
    datei: string,
    erwartet: Speicherstand | null,
    ordner?: string,
  ): Promise<SchreibErgebnis>;

  auflisten(ordner?: string): Promise<string[]>;
  loeschen(datei: string, ordner?: string): Promise<void>;
  ordnerSicherstellen(ordner: string): Promise<void>;
}

// -----------------------------------------------------------------------------
// Umsetzung 1: Microsoft Graph (OneDrive)
// -----------------------------------------------------------------------------

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export interface GraphSpeicherKonfiguration {
  /** Liefert ein gueltiges Zugriffstoken. Siehe B04-C02. */
  tokenHolen: () => Promise<string>;
  /** Ordner, der verwendet wird, wenn beim Aufruf keiner angegeben ist. */
  standardOrdner: string;
  /** Kennung des angemeldeten Kontos (B04-C02 kontoKennung()). Geht in
   *  `kennung` ein. Ohne Angabe "unbekannt" - dann trennen lokale Merker die
   *  Konten NICHT, was nach einem Kontowechsel zu falschen Staenden fuehrt. */
  kontoKennung?: string;
  /** Nur fuer Tests: Ersatz fuer das globale fetch. */
  holen?: typeof fetch;
}

interface GraphEintrag {
  eTag?: string;
  cTag?: string;
}

export function erzeugeGraphSpeicher(config: GraphSpeicherKonfiguration): CloudSpeicher {
  const holen = config.holen ?? fetch;
  const standard = config.standardOrdner;
  const kennung = `graph:${config.kontoKennung ?? "unbekannt"}`;

  const pfad = (datei: string, ordner: string) => `/me/drive/root:/${ordner}/${datei}`;

  async function graphFetch(pfadTeil: string, init: RequestInit = {}): Promise<Response> {
    const token = await config.tokenHolen();
    return holen(`${GRAPH_BASE}${pfadTeil}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });
  }

  function standAus(eintrag: GraphEintrag): Speicherstand {
    return {
      vorhanden: true,
      // Faellt cTag aus (manche Laufwerkstypen liefern keines), tritt eTag ein.
      // Dann schlaegt der Vergleich auch bei reinen Umbenennungen an - lieber
      // ein Abgleich zu viel als ein ueberschriebener Stand.
      inhaltskennung: eintrag.cTag ?? eintrag.eTag ?? null,
      etag: eintrag.eTag ?? null,
    };
  }

  async function standHolen(datei: string, ordner: string = standard): Promise<Speicherstand> {
    const antwort = await graphFetch(`${pfad(datei, ordner)}?$select=eTag,cTag`);
    if (antwort.status === 404) return STAND_FEHLT;
    if (!antwort.ok) throw new Error(`Cloud-Standabfrage fehlgeschlagen (${antwort.status})`);
    return standAus((await antwort.json()) as GraphEintrag);
  }

  async function roh(
    inhalt: unknown,
    datei: string,
    ordner: string,
    kopf: Record<string, string>,
  ): Promise<Response> {
    return graphFetch(`${pfad(datei, ordner)}:/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...kopf },
      body: JSON.stringify(inhalt),
    });
  }

  return {
    kennung,

    async lesen<T = unknown>(datei: string, ordner: string = standard): Promise<T | null> {
      const antwort = await graphFetch(`${pfad(datei, ordner)}:/content`);
      if (antwort.status === 404) return null;
      if (!antwort.ok) throw new Error(`Cloud-Ladefehler (${antwort.status})`);
      return (await antwort.json()) as T;
    },

    async lesenMitStand<T = unknown>(
      datei: string,
      ordner: string = standard,
    ): Promise<GelesenerStand<T>> {
      // Erst den Stand, dann den Inhalt: so gehoert die Kennung zu einem Inhalt,
      // der nicht aelter ist als sie. Umgekehrt koennte zwischen Inhalt und
      // Kennung geschrieben werden und wir merkten uns eine zu neue Kennung.
      const stand = await standHolen(datei, ordner);
      if (!stand.vorhanden) return { daten: null, stand };
      const antwort = await graphFetch(`${pfad(datei, ordner)}:/content`);
      if (antwort.status === 404) return { daten: null, stand: STAND_FEHLT };
      if (!antwort.ok) throw new Error(`Cloud-Ladefehler (${antwort.status})`);
      return { daten: (await antwort.json()) as T, stand };
    },

    standHolen,

    async schreiben(inhalt: unknown, datei: string, ordner: string = standard): Promise<void> {
      const antwort = await roh(inhalt, datei, ordner, {});
      if (!antwort.ok) throw new Error(`Cloud-Speicherfehler (${antwort.status})`);
    },

    async bedingtSchreiben(
      inhalt: unknown,
      datei: string,
      erwartet: Speicherstand | null,
      ordner: string = standard,
    ): Promise<SchreibErgebnis> {
      // --- Riegel 1: nachsehen, ob der Stand noch stimmt ----------------------
      const jetzt = await standHolen(datei, ordner);

      if (erwartet === null || !erwartet.vorhanden) {
        if (jetzt.vorhanden) return { erfolg: false, grund: "schonVorhanden", stand: jetzt };
      } else {
        if (!jetzt.vorhanden) return { erfolg: false, grund: "konflikt", stand: jetzt };
        if (
          erwartet.inhaltskennung !== null &&
          jetzt.inhaltskennung !== null &&
          jetzt.inhaltskennung !== erwartet.inhaltskennung
        ) {
          return { erfolg: false, grund: "konflikt", stand: jetzt };
        }
      }

      // --- Riegel 2: If-Match / If-None-Match mitschicken ---------------------
      // Kostet nichts. Wird der Kopf beachtet, faengt er das Fenster zwischen
      // Riegel 1 und diesem PUT ab. Wird er ignoriert, bleibt Riegel 1 wirksam.
      const kopf: Record<string, string> =
        erwartet === null || !erwartet.vorhanden
          ? { "If-None-Match": "*" }
          : erwartet.etag
            ? { "If-Match": erwartet.etag }
            : {};

      const antwort = await roh(inhalt, datei, ordner, kopf);

      if (antwort.status === 412 || antwort.status === 409) {
        const fremd = await standHolen(datei, ordner);
        return {
          erfolg: false,
          grund: erwartet === null || !erwartet.vorhanden ? "schonVorhanden" : "konflikt",
          stand: fremd,
        };
      }
      if (!antwort.ok) throw new Error(`Cloud-Speicherfehler (${antwort.status})`);

      // Die Antwort des PUT enthaelt den neuen driveItem - daraus den neuen
      // Stand nehmen, statt ihn noch einmal abzufragen.
      let neuerStand: Speicherstand;
      try {
        neuerStand = standAus((await antwort.json()) as GraphEintrag);
      } catch {
        neuerStand = await standHolen(datei, ordner);
      }
      return { erfolg: true, grund: "geschrieben", stand: neuerStand };
    },

    async auflisten(ordner: string = standard): Promise<string[]> {
      const antwort = await graphFetch(
        `/me/drive/root:/${ordner}:/children?$select=name&$top=200`,
      );
      if (antwort.status === 404) return [];
      if (!antwort.ok) throw new Error(`Cloud-Listungsfehler (${antwort.status})`);
      const rumpf = (await antwort.json()) as { value?: { name?: string }[] };
      return (rumpf.value ?? []).map((e) => e.name).filter((n): n is string => !!n);
    },

    async loeschen(datei: string, ordner: string = standard): Promise<void> {
      const vorhanden = await graphFetch(pfad(datei, ordner));
      if (vorhanden.status === 404) return;
      if (!vorhanden.ok) throw new Error(`Cloud-Lesefehler (${vorhanden.status})`);
      const geloescht = await graphFetch(pfad(datei, ordner), { method: "DELETE" });
      if (!geloescht.ok && geloescht.status !== 404) {
        throw new Error(`Cloud-Loeschfehler (${geloescht.status})`);
      }
    },

    async ordnerSicherstellen(ordner: string): Promise<void> {
      const vorhanden = await graphFetch(`/me/drive/root:/${ordner}`);
      if (vorhanden.ok) return;
      if (vorhanden.status !== 404) {
        throw new Error(`Cloud-Ordnerpruefung fehlgeschlagen (${vorhanden.status})`);
      }
      const trenner = ordner.lastIndexOf("/");
      const eltern = ordner.slice(0, trenner);
      const name = ordner.slice(trenner + 1);
      const angelegt = await graphFetch(`/me/drive/root:/${eltern}:/children`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
      });
      if (!angelegt.ok && angelegt.status !== 409) {
        throw new Error(`Cloud-Ordner "${name}" konnte nicht angelegt werden (${angelegt.status})`);
      }
    },
  };
}

// -----------------------------------------------------------------------------
// Umsetzung 2: Attrappe im Arbeitsspeicher
// -----------------------------------------------------------------------------
// Nicht nur zum Testen: Sie ist der Beweis, dass die Schnittstelle wirklich
// austauschbar ist. Laeuft ein Projekt gegen die Attrappe, laeuft es auch gegen
// jede andere Umsetzung, die den Vertrag erfuellt.
//
// Sie bildet das bedingte Schreiben MIT BEIDEN RIEGELN nach - sonst pruefen die
// Selbsttests etwas anderes als die Wirklichkeit. Ueber `dazwischen` laesst
// sich das Fenster zwischen Riegel 1 und dem Schreiben gezielt oeffnen.

export interface SpeicherAttrappe extends CloudSpeicher {
  /** Alle abgelegten Inhalte, Schluessel "ordner/datei". Nur zum Pruefen. */
  inhalt(): Map<string, unknown>;
  /** Angelegte Ordner. Nur zum Pruefen. */
  ordner(): Set<string>;
  /** Wird einmalig zwischen Standpruefung und Schreiben aufgerufen. Damit
   *  laesst sich "ein anderes Geraet schreibt genau jetzt" nachstellen. */
  dazwischen(aktion: (() => void | Promise<void>) | null): void;
  /** Bildet nach, dass der Speicher If-Match nicht beachtet (Riegel 2 aus). */
  ifMatchBeachten(ja: boolean): void;
}

export function erzeugeSpeicherAttrappe(
  standardOrdner = "test",
  kennung = "attrappe:test",
): SpeicherAttrappe {
  const dateien = new Map<string, unknown>();
  const staende = new Map<string, { inhaltskennung: string; etag: string }>();
  const ordnerListe = new Set<string>([standardOrdner]);
  const schluessel = (datei: string, ordner: string) => `${ordner}/${datei}`;
  let zaehler = 0;
  let einmalDazwischen: (() => void | Promise<void>) | null = null;
  let beachteIfMatch = true;

  function standVon(k: string): Speicherstand {
    if (!dateien.has(k)) return STAND_FEHLT;
    const s = staende.get(k)!;
    return { vorhanden: true, inhaltskennung: s.inhaltskennung, etag: s.etag };
  }

  function ablegen(k: string, inhalt: unknown): Speicherstand {
    zaehler += 1;
    dateien.set(k, JSON.parse(JSON.stringify(inhalt)));
    staende.set(k, { inhaltskennung: `c${zaehler}`, etag: `e${zaehler}` });
    return standVon(k);
  }

  return {
    kennung,

    async lesen<T = unknown>(datei: string, ordner: string = standardOrdner): Promise<T | null> {
      const k = schluessel(datei, ordner);
      if (!dateien.has(k)) return null;
      // Kopie zurueckgeben, damit ein Aufrufer den Speicher nicht versehentlich aendert
      return JSON.parse(JSON.stringify(dateien.get(k))) as T;
    },

    async lesenMitStand<T = unknown>(
      datei: string,
      ordner: string = standardOrdner,
    ): Promise<GelesenerStand<T>> {
      const k = schluessel(datei, ordner);
      if (!dateien.has(k)) return { daten: null, stand: STAND_FEHLT };
      return {
        daten: JSON.parse(JSON.stringify(dateien.get(k))) as T,
        stand: standVon(k),
      };
    },

    async standHolen(datei: string, ordner: string = standardOrdner): Promise<Speicherstand> {
      return standVon(schluessel(datei, ordner));
    },

    async schreiben(
      inhalt: unknown,
      datei: string,
      ordner: string = standardOrdner,
    ): Promise<void> {
      if (!ordnerListe.has(ordner)) {
        throw new Error(`Cloud-Speicherfehler (404) - Ordner "${ordner}" fehlt`);
      }
      ablegen(schluessel(datei, ordner), inhalt);
    },

    async bedingtSchreiben(
      inhalt: unknown,
      datei: string,
      erwartet: Speicherstand | null,
      ordner: string = standardOrdner,
    ): Promise<SchreibErgebnis> {
      if (!ordnerListe.has(ordner)) {
        throw new Error(`Cloud-Speicherfehler (404) - Ordner "${ordner}" fehlt`);
      }
      const k = schluessel(datei, ordner);

      // Riegel 1
      const jetzt = standVon(k);
      if (erwartet === null || !erwartet.vorhanden) {
        if (jetzt.vorhanden) return { erfolg: false, grund: "schonVorhanden", stand: jetzt };
      } else {
        if (!jetzt.vorhanden) return { erfolg: false, grund: "konflikt", stand: jetzt };
        if (jetzt.inhaltskennung !== erwartet.inhaltskennung) {
          return { erfolg: false, grund: "konflikt", stand: jetzt };
        }
      }

      // Das Fenster zwischen Riegel 1 und dem Schreiben
      if (einmalDazwischen) {
        const aktion = einmalDazwischen;
        einmalDazwischen = null;
        await aktion();
      }

      // Riegel 2
      if (beachteIfMatch) {
        const spaeter = standVon(k);
        if (erwartet === null || !erwartet.vorhanden) {
          if (spaeter.vorhanden) return { erfolg: false, grund: "schonVorhanden", stand: spaeter };
        } else if (spaeter.inhaltskennung !== erwartet.inhaltskennung) {
          return { erfolg: false, grund: "konflikt", stand: spaeter };
        }
      }

      return { erfolg: true, grund: "geschrieben", stand: ablegen(k, inhalt) };
    },

    async auflisten(ordner: string = standardOrdner): Promise<string[]> {
      if (!ordnerListe.has(ordner)) return [];
      const vorsatz = `${ordner}/`;
      return Array.from(dateien.keys())
        .filter((k) => k.startsWith(vorsatz))
        .map((k) => k.slice(vorsatz.length));
    },

    async loeschen(datei: string, ordner: string = standardOrdner): Promise<void> {
      const k = schluessel(datei, ordner);
      dateien.delete(k);
      staende.delete(k);
    },

    async ordnerSicherstellen(ordner: string): Promise<void> {
      ordnerListe.add(ordner);
    },

    inhalt: () => new Map(dateien),
    ordner: () => new Set(ordnerListe),
    dazwischen: (aktion) => {
      einmalDazwischen = aktion;
    },
    ifMatchBeachten: (ja) => {
      beachteIfMatch = ja;
    },
  };
}

// -----------------------------------------------------------------------------
// Speicherpruefung: was tut der ECHTE Speicher wirklich?
// -----------------------------------------------------------------------------
// Ein Test gegen die Attrappe ersetzt nicht den Nachweis des tatsaechlichen
// Verhaltens. Diese Funktion fuehrt die Messung durch, die dafuer noetig ist.
// Sie schreibt ausschliesslich in eine eigene Pruefdatei und raeumt sie wieder
// weg; echte Daten werden nicht angefasst.

export interface Pruefergebnis {
  zeilen: string[];
  riegel1Wirkt: boolean;
  riegel2Wirkt: boolean | "nichtPruefbar";
}

export async function speicherpruefung(
  speicher: CloudSpeicher,
  ordner?: string,
  dateiname = "Speicherpruefung_bitte-loeschen.json",
): Promise<Pruefergebnis> {
  const zeilen: string[] = [];
  const sag = (text: string) => zeilen.push(text);
  let riegel1Wirkt = false;
  let riegel2Wirkt: boolean | "nichtPruefbar" = "nichtPruefbar";

  sag(`Speicher: ${speicher.kennung}`);
  sag(`Pruefdatei: ${ordner ? ordner + "/" : ""}${dateiname}`);

  try {
    await speicher.loeschen(dateiname, ordner);

    // 1. Erstes Schreiben in eine leere Stelle
    const erst = await speicher.bedingtSchreiben({ lauf: 1 }, dateiname, null, ordner);
    sag(`1. Erstes Schreiben: ${erst.erfolg ? "erfolgreich" : "abgelehnt (" + erst.grund + ")"}`);
    if (!erst.erfolg) {
      sag("   -> Abbruch: die Pruefdatei liess sich nicht anlegen.");
      return { zeilen, riegel1Wirkt, riegel2Wirkt };
    }
    sag(`   Inhaltskennung: ${erst.stand.inhaltskennung ?? "(keine geliefert)"}`);
    sag(`   eTag:           ${erst.stand.etag ?? "(keines geliefert)"}`);

    // 2. Zweites Schreiben mit dem Stand aus Schritt 1 - muss durchgehen
    const zweit = await speicher.bedingtSchreiben({ lauf: 2 }, dateiname, erst.stand, ordner);
    sag(`2. Schreiben mit gueltigem Stand: ${zweit.erfolg ? "erfolgreich" : "ABGELEHNT - unerwartet"}`);

    // 3. Schreiben mit dem inzwischen veralteten Stand aus Schritt 1
    //    -> genau das muss abgelehnt werden
    const dritt = await speicher.bedingtSchreiben({ lauf: 3 }, dateiname, erst.stand, ordner);
    riegel1Wirkt = !dritt.erfolg;
    sag(
      `3. Schreiben mit VERALTETEM Stand: ${dritt.erfolg ? "durchgelassen - GEFAHR" : "abgelehnt (" + dritt.grund + ") - richtig"}`,
    );

    // 4. Liefert der Speicher ueberhaupt unterscheidbare Kennungen?
    const nachher = await speicher.standHolen(dateiname, ordner);
    if (erst.stand.inhaltskennung === null || nachher.inhaltskennung === null) {
      sag("4. Inhaltskennung: der Speicher liefert keine - Riegel 1 kann nicht wirken.");
    } else if (erst.stand.inhaltskennung === nachher.inhaltskennung) {
      sag("4. Inhaltskennung aendert sich NICHT beim Schreiben - Riegel 1 wirkt nicht.");
    } else {
      sag("4. Inhaltskennung aendert sich beim Schreiben - Riegel 1 kann wirken.");
    }

    // 5. Wirkt If-Match ueberhaupt? Das laesst sich von aussen nicht trennscharf
    //    beantworten, weil Riegel 1 schon vorher greift. Festgehalten wird
    //    deshalb nur, ob ueberhaupt ein eTag geliefert wird.
    if (!erst.stand.etag) {
      riegel2Wirkt = false;
      sag("5. Kein eTag geliefert - If-Match kann nicht mitgeschickt werden.");
    } else {
      sag("5. eTag wird geliefert; If-Match wird mitgeschickt. Ob der Speicher ihn");
      sag("   beachtet, ist von aussen nicht trennscharf messbar, weil Riegel 1");
      sag("   vorher greift. Riegel 2 bleibt die Zugabe, nicht die Absicherung.");
    }
  } catch (fehler) {
    sag(`Abbruch mit Fehler: ${fehler instanceof Error ? fehler.message : String(fehler)}`);
  } finally {
    try {
      await speicher.loeschen(dateiname, ordner);
      sag("Pruefdatei wieder entfernt.");
    } catch {
      sag(`Pruefdatei konnte nicht entfernt werden - bitte "${dateiname}" von Hand loeschen.`);
    }
  }

  return { zeilen, riegel1Wirkt, riegel2Wirkt };
}
