// Automatische taegliche Sicherung (Paket C, Kapitel 17).
//
// Baustein C03/Sicherung war gebaut (onedrive.saveBackup), aber nirgends
// eingebunden - siehe P08_Umsetzungsvorschlag-A-D V01-00. Diese Datei haengt
// ihn beim ersten erfolgreichen Speichern des Tages an.
//
// Bewusst von der tatsaechlichen Ablage entkoppelt (listFiles/saveBackup als
// Parameter statt fest gegen onedrive.ts verdrahtet) - so laesst sich die
// Regel ohne echtes OneDrive pruefen, und Schritt 9 (Bausteine einbauen)
// kann sie unveraendert gegen die neue Ablage weiterverwenden.

export interface SicherungsZiel {
  listFiles(folder: string): Promise<string[]>;
  saveBackup(state: unknown, stamp: string): Promise<void>;
}

const SICHERUNGSORDNER_SUFFIX = "/Sicherung";

/** Datumsstempel YYYYMMDD in Ortszeit - ein Name je Tag, damit ein zweiter
 *  Speichervorgang denselben Tag nicht doppelt sichert. */
function tagesStempel(zeitpunkt: Date): string {
  const z = (wert: number) => String(wert).padStart(2, "0");
  return `${zeitpunkt.getFullYear()}${z(zeitpunkt.getMonth() + 1)}${z(zeitpunkt.getDate())}`;
}

export function sicherungsDateiname(tag: string): string {
  return `P08_ToDo-Ticket_Daten_${tag}_AI.json`;
}

/** Einmal taeglich, beim ersten erfolgreichen Speichern: legt eine Sicherung
 *  an, WENN noch keine fuer heute im gemeinsamen Ordner liegt. Der Blick in
 *  den gemeinsamen Ordner (statt eines rein lokalen Merkers) deckt auch
 *  mehrere Geraete am selben Tag ab, ohne doppelt zu sichern. Aufbewahrung:
 *  es wird bewusst nichts automatisch geloescht (siehe Umsetzungsvorschlag).
 *  Ein Fehler hier darf den eigentlichen Speichervorgang nicht scheitern
 *  lassen - Sicherung ist ein Zusatznutzen, keine Bedingung fuers Speichern.
 *  Liefert true, wenn tatsaechlich gesichert wurde (fuer Tests). */
export async function taeglicheSicherung(
  ziel: SicherungsZiel,
  ordner: string,
  db: unknown,
  jetzt: Date = new Date(),
): Promise<boolean> {
  try {
    const tag = tagesStempel(jetzt);
    const dateiname = sicherungsDateiname(tag);
    const vorhanden = await ziel.listFiles(`${ordner}${SICHERUNGSORDNER_SUFFIX}`);
    if (vorhanden.includes(dateiname)) return false;
    await ziel.saveBackup(db, tag);
    return true;
  } catch (error) {
    console.warn(`Automatische Sicherung fehlgeschlagen: ${String(error)}`);
    return false;
  }
}
