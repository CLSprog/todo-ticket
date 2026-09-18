// Excel-Snapshot und Ruecklesen.
//
// Kapitel 15: Der vollstaendige Roundtrip JSON -> Excel -> JSON ist ein
// Abnahmetest (T16). Deshalb werden hier nur Formate benutzt, die sich
// verlustfrei zurueckfuehren lassen:
//   - Datumsfelder als echte Excel-Datumswerte
//   - UTC-Zeitstempel bewusst als ISO-Text (Zeitpunkt und Praezision bleiben)
//   - Arrays/Objekte als gueltiges JSON in den ausgewiesenen Spalten
//   - leere optionale Zellen bleiben leer und werden zu null, nicht zu 0
//   - Text mit fuehrendem "=" wird gegen Formelinjektion geschuetzt und beim
//     Import wieder in den Originaltext zurueckgefuehrt

import ExcelJS from "exceljs";
import { DISPLAY_COLUMNS, DISPLAY_KINDS, FIELD_CATALOG } from "./feldkatalog";
import { assignmentValueIds } from "../data/derive";
import { valueLabel } from "../data/db";
import { fromISODate, toISODate } from "../data/dates";
import { COLLECTIONS, SHEET_NAMES, type CollectionKey, type Database, type Row } from "../data/types";

const FORMEL_PRAEFIX = "'";

function schuetzeText(value: string): string {
  return /^[=+\-@]/.test(value) ? FORMEL_PRAEFIX + value : value;
}

function entschuetzeText(value: string): string {
  return value.startsWith(FORMEL_PRAEFIX) && /^[=+\-@]/.test(value.slice(1)) ? value.slice(1) : value;
}

export async function buildWorkbook(db: Database): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "P08 ToDo-Ticket";
  workbook.created = new Date();

  for (const collection of COLLECTIONS) {
    const felder = FIELD_CATALOG[collection];
    const sheet = workbook.addWorksheet(SHEET_NAMES[collection]);
    const istWorkItem = collection === "tickets" || collection === "tasks";
    const kopf = [...felder.map((f) => f.label), ...(istWorkItem ? DISPLAY_COLUMNS : [])];
    sheet.addRow(kopf);
    sheet.getRow(1).font = { bold: true, name: "Calibri" };

    const rows = (db[collection] ?? []) as unknown as Row[];
    for (const row of rows) {
      const werte: unknown[] = felder.map((feld) => {
        const wert = row[feld.key];
        if (wert === null || wert === undefined) return null;
        if (feld.json) return JSON.stringify(wert);
        if (feld.date && typeof wert === "string") return fromISODate(wert);
        if (typeof wert === "string") return schuetzeText(wert);
        return wert;
      });

      if (istWorkItem) {
        const ticketId = collection === "tasks" ? (row.ticketId as string) : undefined;
        for (const kind of DISPLAY_KINDS) {
          const ids = assignmentValueIds(db, row.id, kind as never, ticketId);
          werte.push(ids.map((id) => valueLabel(db, id)).join(", ") || null);
        }
      }

      const angelegt = sheet.addRow(werte);
      angelegt.font = { name: "Calibri" };
      // Graue Anzeigespalten sichtbar als abgeleitet kennzeichnen.
      if (istWorkItem) {
        for (let i = 0; i < DISPLAY_COLUMNS.length; i += 1) {
          angelegt.getCell(felder.length + 1 + i).font = { name: "Calibri", color: { argb: "FF888888" }, italic: true };
        }
      }
      for (const feld of felder) {
        if (!feld.date) continue;
        const index = felder.indexOf(feld) + 1;
        angelegt.getCell(index).numFmt = "dd.mm.yyyy";
      }
    }

    sheet.columns.forEach((column) => {
      column.width = Math.min(42, Math.max(12, String(column.values?.[1] ?? "").length + 4));
    });
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }

  // Metadaten als Schluessel/Wert-Blatt (Kapitel 15).
  const meta = workbook.addWorksheet("Metadaten");
  meta.addRow(["Schlüssel", "Wert JSON"]);
  meta.getRow(1).font = { bold: true, name: "Calibri" };
  for (const [key, value] of Object.entries(db.meta)) {
    meta.addRow([key, JSON.stringify(value)]).font = { name: "Calibri" };
  }
  meta.columns.forEach((column) => (column.width = 32));

  return workbook;
}

export async function exportExcel(db: Database): Promise<Blob> {
  const workbook = await buildWorkbook(db);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export interface ImportReport {
  db: Database | null;
  meldungen: string[];
}

/** Liest einen Excel-Snapshot zurueck. Unbekannte Spalten werden NICHT
 *  kommentarlos verworfen, sondern gemeldet; falsche Datentypen und doppelte
 *  IDs ebenfalls (Kapitel 17). */
export async function importExcel(data: ArrayBuffer, vorlage: Database): Promise<ImportReport> {
  const meldungen: string[] = [];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);

  const db: Database = { ...vorlage, meta: { ...vorlage.meta } };

  for (const collection of COLLECTIONS) {
    const sheet = workbook.getWorksheet(SHEET_NAMES[collection]);
    if (!sheet) {
      meldungen.push(`Blatt "${SHEET_NAMES[collection]}" fehlt – Sammlung bleibt unverändert.`);
      continue;
    }
    const felder = FIELD_CATALOG[collection];
    const kopf = (sheet.getRow(1).values as unknown[]).slice(1).map((v) => String(v ?? ""));
    const bekannt = new Set<string>([...felder.map((f) => f.label), ...DISPLAY_COLUMNS]);
    for (const spalte of kopf) {
      if (spalte && !bekannt.has(spalte)) meldungen.push(`Unbekannte Spalte "${spalte}" in ${SHEET_NAMES[collection]} – übergangen.`);
    }

    const rows: Row[] = [];
    const gesehen = new Set<string>();
    sheet.eachRow((zeile, nummer) => {
      if (nummer === 1) return;
      const row: Row = { id: "" };
      felder.forEach((feld, index) => {
        const zelle = zeile.getCell(index + 1);
        const wert = zelle.value;
        if (wert === null || wert === undefined || wert === "") {
          (row as Record<string, unknown>)[feld.key] = feld.key === "id" ? "" : null;
          return;
        }
        if (feld.json) {
          try {
            (row as Record<string, unknown>)[feld.key] = JSON.parse(String(wert));
          } catch {
            meldungen.push(`${SHEET_NAMES[collection]} Zeile ${nummer}: "${feld.label}" ist kein gültiges JSON.`);
            (row as Record<string, unknown>)[feld.key] = null;
          }
          return;
        }
        if (feld.date) {
          if (wert instanceof Date) (row as Record<string, unknown>)[feld.key] = toISODate(wert);
          else if (typeof wert === "string" && /^\d{4}-\d{2}-\d{2}$/.test(wert)) (row as Record<string, unknown>)[feld.key] = wert;
          else {
            meldungen.push(`${SHEET_NAMES[collection]} Zeile ${nummer}: "${feld.label}" ist kein Datum.`);
            (row as Record<string, unknown>)[feld.key] = null;
          }
          return;
        }
        if (typeof wert === "string") {
          (row as Record<string, unknown>)[feld.key] = entschuetzeText(wert);
          return;
        }
        (row as Record<string, unknown>)[feld.key] = wert;
      });

      if (!row.id) {
        meldungen.push(`${SHEET_NAMES[collection]} Zeile ${nummer}: ohne ID – übergangen.`);
        return;
      }
      if (gesehen.has(row.id)) {
        meldungen.push(`${SHEET_NAMES[collection]} Zeile ${nummer}: doppelte ID ${row.id} – übergangen.`);
        return;
      }
      gesehen.add(row.id);
      rows.push(row);
    });

    (db as unknown as Record<string, unknown>)[collection] = rows;
  }

  const metaSheet = workbook.getWorksheet("Metadaten");
  if (metaSheet) {
    metaSheet.eachRow((zeile, nummer) => {
      if (nummer === 1) return;
      const key = String(zeile.getCell(1).value ?? "");
      if (!key) return;
      try {
        (db.meta as Record<string, unknown>)[key] = JSON.parse(String(zeile.getCell(2).value ?? "null"));
      } catch {
        meldungen.push(`Metadaten "${key}": kein gültiges JSON – übergangen.`);
      }
    });
  }

  // Beziehungen pruefen: jede Aufgabe muss an einem vorhandenen Ticket haengen.
  const ticketIds = new Set(db.tickets.map((t) => t.id));
  for (const task of db.tasks) {
    if (!ticketIds.has(task.ticketId)) meldungen.push(`Aufgabe ${task.id} verweist auf unbekanntes Ticket ${task.ticketId}.`);
    if (task.predecessorId && !db.tasks.some((t) => t.id === task.predecessorId)) {
      meldungen.push(`Aufgabe ${task.id} verweist auf unbekannte Vorgängeraufgabe ${task.predecessorId}.`);
    }
  }

  return { db, meldungen };
}

export function collectionCounts(db: Database): Record<CollectionKey, number> {
  return Object.fromEntries(COLLECTIONS.map((key) => [key, (db[key] ?? []).length])) as Record<CollectionKey, number>;
}
