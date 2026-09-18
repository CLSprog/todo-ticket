// =============================================================================
// B04-C07  Datei-Download im Browser
// -----------------------------------------------------------------------------
// Fassung   : V01-00
// Stand     : 2026-09-07, 22:16
// Herkunft  : P03_Packliste V04-04, src/SchemaApp.tsx (Zeilen 166-185)
// Sprache   : TypeScript, keine fremden Bibliotheken
//
// ZWECK
// Drei Kleinigkeiten, die in jedem Browser-Projekt gebraucht werden, wenn der
// Nutzer eine erzeugte Datei bekommen soll: einen Dateinamen entschärfen, einen
// Zeitstempel bilden, und einen Blob tatsächlich zum Download anbieten.
//
// VERTRAG (ändert sich nur mit VV)
//   safeFilename(value, ersatz?) -> string
//   dateStamp(zeitpunkt?)        -> string   Format YYYYMMDD-HHMM
//   downloadBlob(blob, filename) -> void     braucht ein Browser-DOM
//
// GRENZEN - bewusst nicht gelöst, damit das Verhalten dem von P03 entspricht:
//   - Unter Windows reservierte Namen (CON, PRN, NUL, AUX, COM1 ...) und
//     Namen mit Punkt am Ende werden NICHT behandelt.
//   - dateStamp arbeitet in der ORTSZEIT des Geräts, nicht in UTC.
//   - downloadBlob läuft nur im Browser; in Node gibt es kein document.
// =============================================================================

/** Zeichen, die in Dateinamen auf Windows/macOS/Linux Probleme machen. */
const UNZULAESSIG = /[<>:"/\\|?*\u0000-\u001F]/g;

/** Wartezeit, bevor die temporäre Objekt-URL wieder freigegeben wird (ms). */
const FREIGABE_VERZOEGERUNG_MS = 1000;

/**
 * Entschärft eine beliebige Zeichenkette zu einem brauchbaren Dateinamen.
 * Unzulässige Zeichen werden zu "-", Leerraum zu "_", Mehrfach-"_" zu einem.
 *
 * @param value  Rohtext, z. B. ein Reise- oder Projektname
 * @param ersatz Rückfallwert, wenn nach dem Säubern nichts übrig bleibt
 */
export function safeFilename(value: string, ersatz = "Datei"): string {
  return (
    value
      .trim()
      .replace(UNZULAESSIG, "-")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_") || ersatz
  );
}

/**
 * Zeitstempel im Format YYYYMMDD-HHMM, in der Ortszeit des Geräts.
 *
 * @param zeitpunkt Optional ein fester Zeitpunkt - ohne Angabe "jetzt".
 *                  Die Angabe existiert, damit der Baustein prüfbar ist.
 */
export function dateStamp(zeitpunkt: Date = new Date()): string {
  const zweistellig = (wert: number) => String(wert).padStart(2, "0");
  return (
    `${zeitpunkt.getFullYear()}` +
    `${zweistellig(zeitpunkt.getMonth() + 1)}` +
    `${zweistellig(zeitpunkt.getDate())}` +
    `-` +
    `${zweistellig(zeitpunkt.getHours())}` +
    `${zweistellig(zeitpunkt.getMinutes())}`
  );
}

/**
 * Bietet einen Blob im Browser als Download an.
 * Erzeugt eine temporäre Objekt-URL, klickt einen unsichtbaren Link und
 * gibt die URL kurz darauf wieder frei.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), FREIGABE_VERZOEGERUNG_MS);
}
