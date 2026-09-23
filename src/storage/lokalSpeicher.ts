// Lokaler Speicher (Modus "Nur dieses Gerät") als C01-CloudSpeicher.
//
// Damit die App fuer BEIDE Speicherorte (lokal/OneDrive) durch dasselbe
// C09-Speicherwerk laeuft, statt zwei getrennte Ablaufe zu pflegen, bildet
// diese Datei denselben CloudSpeicher-Vertrag (B04-C01 V02-00) einfach gegen
// localStorage ab. Es gibt hier keine zwei echten Geraete, die sich in die
// Quere kommen koennten - "bedingtes Schreiben" dient trotzdem als
// Sicherheitsnetz gegen zwei Tabs desselben Browsers.
//
// Injizierbare Ablage (wie C05s SchluesselAblage), damit sich der Vertrag
// ohne echtes localStorage pruefen laesst.

import type { CloudSpeicher, GelesenerStand, SchreibErgebnis, Speicherstand } from "../bausteine/B04-C01_Cloud-Speicher_V02-00";
import { STAND_FEHLT } from "../bausteine/B04-C01_Cloud-Speicher_V02-00";

export interface EinfacheAblage {
  getItem(schluessel: string): string | null;
  setItem(schluessel: string, wert: string): void;
  removeItem(schluessel: string): void;
  /** Alle vorhandenen Schluessel - fuer auflisten(). */
  keys(): string[];
}

interface Eintrag {
  inhalt: unknown;
  stand: string; // wachsende Kennung, dient als inhaltskennung UND etag
}

let zaehler = 0;
function neueKennung(): string {
  zaehler += 1;
  return `lokal-${Date.now().toString(36)}-${zaehler}`;
}

function voll(vorsatz: string, ordner: string, datei: string): string {
  return `${vorsatz}${ordner}/${datei}`;
}

export function erzeugeLokalSpeicher(
  vorsatz = "p08_lokal_",
  ablage: EinfacheAblage = typeof localStorage !== "undefined" ? (localStorage as unknown as EinfacheAblage) : erzeugeSpeicherImArbeitsspeicher(),
): CloudSpeicher {
  function lies(schluessel: string): Eintrag | null {
    const roh = ablage.getItem(schluessel);
    if (!roh) return null;
    try {
      return JSON.parse(roh) as Eintrag;
    } catch {
      return null;
    }
  }

  function standAus(eintrag: Eintrag | null): Speicherstand {
    if (!eintrag) return STAND_FEHLT;
    return { vorhanden: true, inhaltskennung: eintrag.stand, etag: eintrag.stand };
  }

  return {
    kennung: "lokal",

    async lesen<T = unknown>(datei: string, ordner = ""): Promise<T | null> {
      const eintrag = lies(voll(vorsatz, ordner, datei));
      return eintrag ? (eintrag.inhalt as T) : null;
    },

    async lesenMitStand<T = unknown>(datei: string, ordner = ""): Promise<GelesenerStand<T>> {
      const eintrag = lies(voll(vorsatz, ordner, datei));
      return { daten: eintrag ? (eintrag.inhalt as T) : null, stand: standAus(eintrag) };
    },

    async standHolen(datei: string, ordner = ""): Promise<Speicherstand> {
      return standAus(lies(voll(vorsatz, ordner, datei)));
    },

    async schreiben(inhalt: unknown, datei: string, ordner = ""): Promise<void> {
      ablage.setItem(voll(vorsatz, ordner, datei), JSON.stringify({ inhalt, stand: neueKennung() } satisfies Eintrag));
    },

    async bedingtSchreiben(
      inhalt: unknown,
      datei: string,
      erwartet: Speicherstand | null,
      ordner = "",
    ): Promise<SchreibErgebnis> {
      const schluessel = voll(vorsatz, ordner, datei);
      const jetzt = standAus(lies(schluessel));

      if (erwartet === null || !erwartet.vorhanden) {
        if (jetzt.vorhanden) return { erfolg: false, grund: "schonVorhanden", stand: jetzt };
      } else if (!jetzt.vorhanden || jetzt.inhaltskennung !== erwartet.inhaltskennung) {
        return { erfolg: false, grund: "konflikt", stand: jetzt };
      }

      const eintrag: Eintrag = { inhalt, stand: neueKennung() };
      ablage.setItem(schluessel, JSON.stringify(eintrag));
      return { erfolg: true, grund: "geschrieben", stand: standAus(eintrag) };
    },

    async auflisten(ordner = ""): Promise<string[]> {
      const praefix = voll(vorsatz, ordner, "");
      return ablage
        .keys()
        .filter((k) => k.startsWith(praefix))
        .map((k) => k.slice(praefix.length));
    },

    async loeschen(datei: string, ordner = ""): Promise<void> {
      ablage.removeItem(voll(vorsatz, ordner, datei));
    },

    // localStorage kennt keine echten Ordner - nichts anzulegen.
    async ordnerSicherstellen(): Promise<void> {},
  };
}

/** Ersatzablage, falls kein localStorage verfuegbar ist (z. B. Tests). */
export function erzeugeSpeicherImArbeitsspeicher(): EinfacheAblage {
  const daten = new Map<string, string>();
  return {
    getItem: (k) => daten.get(k) ?? null,
    setItem: (k, v) => void daten.set(k, v),
    removeItem: (k) => void daten.delete(k),
    keys: () => Array.from(daten.keys()),
  };
}
