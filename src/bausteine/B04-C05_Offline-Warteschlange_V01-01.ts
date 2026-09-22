// =============================================================================
// B04-C05  Offline-Warteschlange / lokaler Zwischenspeicher
// -----------------------------------------------------------------------------
// Fassung   : V01-01
// Stand     : 2026-09-19, 08:41
// Herkunft  : B04-C05 V01-00 vom 2026-09-07 (aus P03_Packliste V04-04,
//             src/syncStore.ts)
// Sprache   : TypeScript, keine fremden Bibliotheken
//
// V01-01 und nicht V02-00: der Vertrag von V01-00 gilt weiter. Die
// Schreibfunktionen liefern jetzt zusaetzlich einen Wahrheitswert zurueck, und
// es kommen Funktionen dazu. Wer V01-00 aufruft, bekommt dasselbe Verhalten;
// den Rueckgabewert darf er ignorieren.
//
// WAS GEGENUEBER V01-00 ANDERS IST - drei Maengel aus der Pruefung vom 19.09.
//
// 1. SCHREIBFEHLER WURDEN VERSCHLUCKT.
//    V01-00 hatte `catch { /* bewusst still */ }`. Die Absicht war richtig: ein
//    volles oder gesperrtes localStorage darf die App nicht anhalten. Die
//    Ausfuehrung war falsch: die App erfuhr NIE, dass ihr Sicherheitsnetz
//    fehlt. Sie zeigte "offline gemerkt" an, obwohl nichts gemerkt wurde -
//    genau der Fall, in dem Arbeit verloren geht.
//    Jetzt: jeder Zugriff liefert Erfolg/Misserfolg, und `beiFehler` meldet
//    den Grund. Angehalten wird weiterhin nichts.
//
// 2. SCHLUESSEL KANNTEN WEDER SPEICHERORT NOCH KONTO.
//    Der Vorsatz trennte nur Projekte. Wechselt die App den Speicherort oder
//    das Konto (privates gegen dienstliches Microsoft-Konto), traf sie auf die
//    baseline des ANDEREN Speichers. Der Drei-Wege-Abgleich haelt dann fremde
//    Daten fuer den eigenen letzten Stand - und verwirft echte Aenderungen als
//    "schon bekannt".
//    Jetzt: `raum` geht in jeden Schluessel ein. Ueblicherweise die `kennung`
//    des Speichers (B04-C01 V02-00), die Speicher UND Konto enthaelt.
//
// 3. allesLoeschen() LOESCHTE NUR, WAS DIESE SITZUNG GESCHRIEBEN HATTE.
//    Die Merkliste lag im Arbeitsspeicher. Nach einem Neuladen war sie leer,
//    und allesLoeschen() tat nichts - obwohl im Speicher noch Staende lagen.
//    Jetzt: die Liste liegt als eigener Eintrag mit in der Ablage.
//
// UEBERNAHME ALTER STAENDE
// Damit Aenderung 2 keine Daten verliert, wird beim Lesen unter dem alten,
// raumlosen Schluessel nachgesehen, wenn unter dem neuen nichts liegt. Was dort
// liegt, wandert einmalig herueber. Das geschieht je Datei und nur einmal:
// welcher Speicher zuerst liest, erbt den alten Stand. Das ist gewollt - bei
// einem Wechsel gibt es genau einen Vorbesitzer.
//
// VERTRAG (V01-00 bleibt gueltig; Neues ist als NEU gekennzeichnet)
//   erzeugeZwischenspeicher<T>(optionen) -> {
//     verfuegbar                       -> boolean               NEU
//     baselineLesen(datei)             -> T | null
//     baselineSchreiben(datei, d)      -> boolean               (war void)
//     ausstehendLesen(datei)           -> T | null
//     ausstehendSchreiben(datei, d)    -> boolean               (war void)
//     ausstehendLoeschen(datei)        -> boolean               (war void)
//     ausstehendeDateien()             -> string[]              NEU
//     allesLoeschen()                  -> boolean               (war void)
//   }
//   istVerbindungsfehler(fehler, online?) -> boolean
//
// GRENZE: localStorage fasst je nach Browser rund 5 MB. Wer mehr braucht, muss
// auf IndexedDB wechseln - dann aendert sich der Vertrag (VV steigt).
// =============================================================================

/** Was der Zwischenspeicher von seiner Ablage braucht - erlaubt einen Ersatz im Test. */
export interface SchluesselAblage {
  getItem(schluessel: string): string | null;
  setItem(schluessel: string, wert: string): void;
  removeItem(schluessel: string): void;
}

export type Zwischenvorgang = "lesen" | "schreiben" | "loeschen";

export interface ZwischenspeicherOptionen {
  /** Vorsatz fuer alle Schluessel, z. B. "p08_". Trennt Projekte voneinander. */
  vorsatz: string;
  /**
   * NEU: Namensraum fuer Speicherort und Konto, ueblicherweise
   * `speicher.kennung` aus B04-C01 V02-00. Ohne Angabe verhaelt sich der
   * Baustein wie V01-00 - dann trennt nichts die Speicherorte, und nach einem
   * Wechsel gelten fremde Staende als eigene.
   */
  raum?: string;
  /** Ablage; ohne Angabe der localStorage des Browsers. */
  ablage?: SchluesselAblage;
  /**
   * NEU: wird bei jedem fehlgeschlagenen Zugriff gerufen. Die App entscheidet,
   * was sie damit tut (Zustandsanzeige, Protokoll). Wirft dieser Rueckruf
   * selbst, wird das ignoriert - eine Fehlermeldung darf keinen Fehler ausloesen.
   */
  beiFehler?: (vorgang: Zwischenvorgang, schluessel: string, fehler: unknown) => void;
  /** NEU: Staende aus der Zeit ohne `raum` uebernehmen. Vorgabe: true. */
  altenBestandUebernehmen?: boolean;
}

export interface Zwischenspeicher<T> {
  /** false, wenn gar keine Ablage zur Verfuegung steht (z. B. privates Fenster). */
  readonly verfuegbar: boolean;
  baselineLesen(datei: string): T | null;
  baselineSchreiben(datei: string, daten: T): boolean;
  ausstehendLesen(datei: string): T | null;
  ausstehendSchreiben(datei: string, daten: T): boolean;
  ausstehendLoeschen(datei: string): boolean;
  /** Dateien, fuer die ein ungespeicherter Stand vorliegt. */
  ausstehendeDateien(): string[];
  allesLoeschen(): boolean;
}

const INDEX = "_index";

export function erzeugeZwischenspeicher<T>(
  optionen: ZwischenspeicherOptionen,
): Zwischenspeicher<T> {
  const ablage: SchluesselAblage | null =
    optionen.ablage ?? (typeof localStorage !== "undefined" ? localStorage : null);
  const vorsatz = optionen.vorsatz;
  const raumTeil = optionen.raum ? `${optionen.raum}_` : "";
  const uebernehmen = optionen.altenBestandUebernehmen !== false && raumTeil !== "";

  const neuerSchluessel = (teil: string) => `${vorsatz}${raumTeil}${teil}`;
  const alterSchluessel = (teil: string) => `${vorsatz}${teil}`;

  function melden(vorgang: Zwischenvorgang, schluessel: string, fehler: unknown): void {
    if (!optionen.beiFehler) return;
    try {
      optionen.beiFehler(vorgang, schluessel, fehler);
    } catch {
      // Eine Fehlermeldung darf keinen Fehler ausloesen.
    }
  }

  // --- roher Zugriff ---------------------------------------------------------

  function rohLesen(voll: string): string | null {
    if (!ablage) return null;
    try {
      return ablage.getItem(voll);
    } catch (fehler) {
      melden("lesen", voll, fehler);
      return null;
    }
  }

  function rohSchreiben(voll: string, wert: string): boolean {
    if (!ablage) return false;
    try {
      ablage.setItem(voll, wert);
      return true;
    } catch (fehler) {
      melden("schreiben", voll, fehler);
      return false;
    }
  }

  function rohLoeschen(voll: string): boolean {
    if (!ablage) return false;
    try {
      ablage.removeItem(voll);
      return true;
    } catch (fehler) {
      melden("loeschen", voll, fehler);
      return false;
    }
  }

  // --- Merkliste der belegten Schluessel, in der Ablage ----------------------

  function indexLesen(): string[] {
    const roh = rohLesen(neuerSchluessel(INDEX));
    if (!roh) return [];
    try {
      const wert = JSON.parse(roh);
      return Array.isArray(wert) ? (wert.filter((e) => typeof e === "string") as string[]) : [];
    } catch {
      return [];
    }
  }

  function indexSchreiben(teile: string[]): void {
    rohSchreiben(neuerSchluessel(INDEX), JSON.stringify(teile));
  }

  function indexAufnehmen(teil: string): void {
    const liste = indexLesen();
    if (!liste.includes(teil)) indexSchreiben([...liste, teil]);
  }

  function indexEntfernen(teil: string): void {
    const liste = indexLesen();
    if (liste.includes(teil)) indexSchreiben(liste.filter((e) => e !== teil));
  }

  // --- Lesen, Schreiben, Loeschen mit Uebernahme -----------------------------

  function lesen(teil: string): T | null {
    const roh = rohLesen(neuerSchluessel(teil));
    if (roh !== null) {
      try {
        return JSON.parse(roh) as T;
      } catch (fehler) {
        // Beschaedigter Eintrag: melden und wie "nichts da" behandeln. Der
        // Server liefert beim naechsten Laden ohnehin den gueltigen Stand.
        melden("lesen", neuerSchluessel(teil), fehler);
        return null;
      }
    }
    if (!uebernehmen) return null;

    // Unter dem alten, raumlosen Schluessel nachsehen und einmalig uebernehmen.
    const alt = rohLesen(alterSchluessel(teil));
    if (alt === null) return null;
    let daten: T;
    try {
      daten = JSON.parse(alt) as T;
    } catch (fehler) {
      melden("lesen", alterSchluessel(teil), fehler);
      return null;
    }
    if (rohSchreiben(neuerSchluessel(teil), alt)) {
      indexAufnehmen(teil);
      rohLoeschen(alterSchluessel(teil));
    }
    return daten;
  }

  function schreiben(teil: string, daten: T): boolean {
    let text: string;
    try {
      text = JSON.stringify(daten);
    } catch (fehler) {
      melden("schreiben", neuerSchluessel(teil), fehler);
      return false;
    }
    if (!rohSchreiben(neuerSchluessel(teil), text)) return false;
    indexAufnehmen(teil);
    return true;
  }

  function loeschen(teil: string): boolean {
    const erfolg = rohLoeschen(neuerSchluessel(teil));
    if (erfolg) indexEntfernen(teil);
    return erfolg;
  }

  return {
    verfuegbar: ablage !== null,

    baselineLesen: (datei) => lesen(`baseline_${datei}`),
    baselineSchreiben: (datei, daten) => schreiben(`baseline_${datei}`, daten),

    ausstehendLesen: (datei) => lesen(`pending_${datei}`),
    ausstehendSchreiben: (datei, daten) => schreiben(`pending_${datei}`, daten),
    ausstehendLoeschen: (datei) => loeschen(`pending_${datei}`),

    ausstehendeDateien: () =>
      indexLesen()
        .filter((teil) => teil.startsWith("pending_"))
        .map((teil) => teil.slice("pending_".length)),

    allesLoeschen: () => {
      let alles = true;
      for (const teil of indexLesen()) {
        if (!rohLoeschen(neuerSchluessel(teil))) alles = false;
      }
      if (!rohLoeschen(neuerSchluessel(INDEX))) alles = false;
      return alles;
    },
  };
}

/**
 * Unterscheidet einen echten Netzwerkausfall von einem Serverfehler (z. B.
 * abgelaufener Login) UND von einem echten Programmierfehler.
 *
 * WARUM DAS WICHTIG IST - Lehre aus P03: Bis V03-00 galt JEDER TypeError als
 * "keine Verbindung". Ein echter Programmierfehler wurde dadurch verschluckt
 * und als "offline" angezeigt, statt sichtbar zu werden. Das kostete am
 * 2026-08-30 einen ganzen Tag Fehlersuche ("es wird nichts gespeichert").
 *
 * NEU in V01-01: Ein Fehler darf sich selbst kennzeichnen. Traegt er die
 * Eigenschaft `verbindungsfehler`, entscheidet allein diese. Damit kann z. B.
 * ein "Nicht angemeldet"-Fehler aus B04-C02 nie als Netzausfall durchgehen -
 * auch dann nicht, wenn das Geraet gerade wirklich offline ist. Sonst waere
 * die Folge: die App sammelt still weiter, obwohl eine Anmeldung fehlt.
 */
export function istVerbindungsfehler(fehler: unknown, online?: boolean): boolean {
  if (typeof fehler === "object" && fehler !== null && "verbindungsfehler" in fehler) {
    return (fehler as { verbindungsfehler: unknown }).verbindungsfehler === true;
  }
  const istOnline = online ?? (typeof navigator !== "undefined" ? navigator.onLine : true);
  if (!istOnline) return true;
  if (!(fehler instanceof TypeError)) return false;
  const meldung = fehler.message.toLowerCase();
  return (
    meldung.includes("failed to fetch") || // Chrome/Edge
    meldung.includes("networkerror") || // Firefox
    meldung.includes("load failed") || // Safari
    meldung.includes("network request failed")
  );
}

/** Einfache Ablage im Arbeitsspeicher - fuer Tests und fuer Umgebungen ohne
 *  localStorage. `sperren()` stellt ein volles oder gesperrtes localStorage nach. */
export interface AblageAttrappe extends SchluesselAblage {
  inhalt(): Map<string, string>;
  sperren(ja: boolean): void;
}

export function erzeugeAblageAttrappe(start?: Record<string, string>): AblageAttrappe {
  const daten = new Map<string, string>(Object.entries(start ?? {}));
  let gesperrt = false;
  return {
    getItem: (k) => {
      if (gesperrt) throw new Error("Ablage gesperrt");
      return daten.has(k) ? daten.get(k)! : null;
    },
    setItem: (k, v) => {
      if (gesperrt) throw new Error("Ablage voll");
      daten.set(k, v);
    },
    removeItem: (k) => {
      if (gesperrt) throw new Error("Ablage gesperrt");
      daten.delete(k);
    },
    inhalt: () => new Map(daten),
    sperren: (ja) => {
      gesperrt = ja;
    },
  };
}
