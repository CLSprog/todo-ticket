// Lokale Zwischenspeicherung fuer Offline-Betrieb.
//
// Baustein-Uebernahme aus P03 Packliste (src/syncStore.ts, Stand 2026-09-04),
// generisch ueber den Datentyp gemacht und mit eigenem Praefix.
//
// "baseline" = der letzte Stand, der nachweislich mit dem Server abgeglichen
// wurde (Grundlage des 3-Wege-Vergleichs). "pending" = der aktuelle
// Arbeitsstand, auch wenn er noch nicht gespeichert werden konnte. Beides ist
// reiner Cache, kein Ersatz fuer OneDrive.

import type { Database } from "../data/types";

const PREFIX = "p08_sync_";

function read(key: string): Database | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Database) : null;
  } catch {
    return null; // z.B. privates Fenster ohne Speicherzugriff - dann laeuft es ohne Cache
  }
}

/** Gibt zurueck, ob das Schreiben gelungen ist. Ein stiller Fehlschlag waere
 *  hier gefaehrlich: die App wuerde "lokal gesichert" anzeigen, obwohl nichts
 *  gesichert ist (voller Speicher, privates Fenster, blockierte Site-Daten). */
function write(key: string, data: Database): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

function clear(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // ignorieren
  }
}

export function readBaseline(file: string): Database | null {
  return read(`baseline_${file}`);
}
export function writeBaseline(file: string, data: Database): boolean {
  return write(`baseline_${file}`, data);
}
export function readPending(file: string): Database | null {
  return read(`pending_${file}`);
}
export function writePending(file: string, data: Database): boolean {
  return write(`pending_${file}`, data);
}
export function clearPending(file: string) {
  clear(`pending_${file}`);
}

/** Netzwerkfehler von echten Server- und Programmierfehlern unterscheiden -
 *  nur bei echten Netzwerkfehlern still in den Offline-Modus wechseln, alles
 *  andere sichtbar melden (P03-Lektion vom 2026-08-30). */
export function istVerbindungsfehler(error: unknown): boolean {
  if (!navigator.onLine) return true;
  if (!(error instanceof TypeError)) return false;
  const meldung = error.message.toLowerCase();
  return (
    meldung.includes("failed to fetch") || // Chrome/Edge
    meldung.includes("networkerror") || // Firefox
    meldung.includes("load failed") || // Safari
    meldung.includes("network request failed")
  );
}
