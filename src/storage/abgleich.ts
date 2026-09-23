// P08-spezifische Verdrahtung des Bausteins B04-C04 (Drei-Wege-Abgleich) und
// B04-C06 (Konfliktdialog) gegen das eigene Datenmodell.
//
// Bewusst eigene, unversionierte App-Glue-Datei - kein Baustein: die
// Bausteine selbst kennen P08s Tabellen und Felder nicht.

import { COLLECTIONS, type Database } from "../data/types";
import { valueLabel } from "../data/db";
import { formatDate, formatTimestamp } from "../data/dates";
import type { AbgleichOptionen, Zeile } from "../bausteine/B04-C04_Drei-Wege-Abgleich_V02-00";
import type { WertFormatierer } from "../bausteine/B04-C06_Konfliktdialog_V01-01";

/** Buchhaltungsfelder, die sich bei jeder Aenderung mitbewegen und sonst
 *  jeden echten Konflikt verdoppeln wuerden. Der lokale Wert gilt dafuer
 *  immer - eine Abweichung hier ist nie das, was der Mensch entscheiden soll. */
export const ABGLEICH_OPTIONEN: AbgleichOptionen = {
  tabellen: [...COLLECTIONS],
  feldAusnehmen: (tabelle, feld) => {
    if (feld === "updatedAt" || feld === "revision") return true;
    if (tabelle === "meta" && (feld === "generatedAt" || feld === "dataRevision")) return true;
    return false;
  },
  beschreibe: (tabelle, zeile) => {
    const titel = (zeile.title ?? zeile.label ?? zeile.name ?? zeile.text) as string | undefined;
    return `${tabelle}: ${titel ? String(titel).slice(0, 60) : zeile.id}`;
  },
  // Eine Tabelle, die eine Seite gar nicht kennt (z. B. eine Datei aus einer
  // aelteren Programmfassung), gilt als von dieser Seite unangetastet - nie
  // als "alles geloescht".
  fehlendeTabelle: "unveraendert",
};

const WERT_IDS = new Set(["leadId", "delegatedToId", "personId", "valueId"]);
const ENTITAETS_IDS = new Set(["ticketId", "predecessorId", "entityId"]);
const DATUMS_FELDER = new Set(["dueDate", "startDate", "delegationDueDate"]);

function titelVonEntitaet(db: Database, id: string): string | undefined {
  return db.tickets.find((t) => t.id === id)?.title ?? db.tasks.find((t) => t.id === id)?.title;
}

/** Uebersetzt IDs in Namen und Zeitstempel in Datumsform, damit der
 *  Konfliktdialog keine nackten UUIDs mehr zeigt (Befund C06-1). Schaut dabei
 *  im UEBERGEBENEN Bestand nach (typischerweise der zusammengefuehrte Stand
 *  vor der Entscheidung), nicht in einem separat mitgefuehrten. */
export function erzeugeFormatierer(db: Database): WertFormatierer {
  return (_tabelle, feld, wert, _zeile: Zeile | null) => {
    if (wert === null || wert === undefined) return "—";
    if (wert === "") return "(leer)";
    if (typeof wert === "string") {
      if (WERT_IDS.has(feld)) return valueLabel(db, wert) || wert;
      if (ENTITAETS_IDS.has(feld)) return titelVonEntitaet(db, wert) ?? wert;
      if (DATUMS_FELDER.has(feld)) return formatDate(wert);
      if (feld.endsWith("At") && wert.includes("T")) return formatTimestamp(wert);
    }
    if (Array.isArray(wert)) return wert.length === 0 ? "(leer)" : wert.map(String).join(", ");
    return String(wert);
  };
}
