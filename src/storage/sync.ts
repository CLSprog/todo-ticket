// 3-Wege-Abgleich zwischen Baseline, lokalem und entferntem Stand.
//
// Baustein-Uebernahme aus P03 Packliste (src/sync.ts, Stand 2026-09-04),
// generisch ueber die Sammlungen aus data/types gemacht statt auf feste
// Tabellen verdrahtet.
//
// Konzept Kapitel 16: updatedAt allein genuegt nicht (Uhrenabweichungen),
// deshalb wird zeilenweise gegen die Baseline verglichen. Konfliktfrei
// Zusammenfuehrbares wird zusammengefuehrt, konkurrierende Aenderungen am
// selben Feld werden vorgelegt und nie still ueberschrieben.

import { COLLECTIONS, type CollectionKey, type Database, type Row } from "../data/types";

export interface FieldConflict {
  collection: CollectionKey;
  id: string;
  field: string;
  beschreibung: string;
  lokal: unknown;
  entfernt: unknown;
}

export interface AutoMerged {
  collection: CollectionKey;
  id: string;
  beschreibung: string;
  herkunft: "lokal" | "entfernt";
}

export interface SyncResult {
  merged: Database;
  conflicts: FieldConflict[];
  automatisch: AutoMerged[];
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

function rowEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

export function databaseEqual(a: Database, b: Database): boolean {
  return COLLECTIONS.every((key) => rowEqual(a[key], b[key]));
}

function toMap(rows: Row[]): Map<string, Row> {
  const map = new Map<string, Row>();
  for (const row of rows) map.set(row.id, row);
  return map;
}

function beschreibe(collection: CollectionKey, row: Row): string {
  const titel = (row.title ?? row.label ?? row.name ?? row.text) as string | undefined;
  return `${collection}: ${titel?.slice(0, 60) || row.id}`;
}

/** Zeilenweiser Dreiwegevergleich. Eine Zeile, die nur auf einer Seite
 *  geaendert wurde, wird uebernommen. Wurde sie auf beiden Seiten geaendert,
 *  entscheidet der Feldvergleich: unterschiedliche Felder werden vereinigt,
 *  dasselbe Feld mit unterschiedlichem Wert wird als Konflikt gemeldet. */
export function diffAndMerge(baseline: Database, lokal: Database, entfernt: Database): SyncResult {
  const conflicts: FieldConflict[] = [];
  const automatisch: AutoMerged[] = [];
  const merged: Partial<Database> = { meta: { ...entfernt.meta, ...lokal.meta } };

  for (const collection of COLLECTIONS) {
    const base = toMap((baseline[collection] ?? []) as unknown as Row[]);
    const links = toMap((lokal[collection] ?? []) as unknown as Row[]);
    const rechts = toMap((entfernt[collection] ?? []) as unknown as Row[]);
    const ids = new Set([...base.keys(), ...links.keys(), ...rechts.keys()]);
    const ergebnis: Row[] = [];

    for (const id of ids) {
      const b = base.get(id);
      const l = links.get(id);
      const r = rechts.get(id);

      if (l && !r) {
        // Nur lokal vorhanden: neu angelegt, solange die Baseline sie nicht kannte.
        if (!b) automatisch.push({ collection, id, beschreibung: beschreibe(collection, l), herkunft: "lokal" });
        ergebnis.push(l);
        continue;
      }
      if (r && !l) {
        if (!b) automatisch.push({ collection, id, beschreibung: beschreibe(collection, r), herkunft: "entfernt" });
        ergebnis.push(r);
        continue;
      }
      if (!l || !r) continue;

      if (rowEqual(l, r)) {
        ergebnis.push(l);
        continue;
      }
      if (b && rowEqual(b, l)) {
        automatisch.push({ collection, id, beschreibung: beschreibe(collection, r), herkunft: "entfernt" });
        ergebnis.push(r);
        continue;
      }
      if (b && rowEqual(b, r)) {
        automatisch.push({ collection, id, beschreibung: beschreibe(collection, l), herkunft: "lokal" });
        ergebnis.push(l);
        continue;
      }

      // Beide Seiten geaendert: Feld fuer Feld pruefen.
      const zusammengefuehrt: Row = { ...r };
      const felder = new Set([...Object.keys(l), ...Object.keys(r)]);
      for (const feld of felder) {
        if (feld === "id") continue;
        const lw = l[feld];
        const rw = r[feld];
        if (rowEqual(lw, rw)) continue;
        const bw = b?.[feld];
        if (b && rowEqual(bw, rw)) {
          zusammengefuehrt[feld] = lw; // nur lokal geaendert
          continue;
        }
        if (b && rowEqual(bw, lw)) {
          zusammengefuehrt[feld] = rw; // nur entfernt geaendert
          continue;
        }
        conflicts.push({
          collection,
          id,
          field: feld,
          beschreibung: beschreibe(collection, l),
          lokal: lw,
          entfernt: rw,
        });
      }
      ergebnis.push(zusammengefuehrt);
    }

    (merged as unknown as Record<string, unknown>)[collection] = ergebnis;
  }

  return { merged: merged as Database, conflicts, automatisch };
}

/** Wendet die Entscheidungen des Benutzers auf das Zusammenfuehrungsergebnis an. */
export function applyConflictResolutions(
  merged: Database,
  conflicts: FieldConflict[],
  entscheidungen: Record<string, "lokal" | "entfernt">,
): Database {
  const next: Database = { ...merged };
  for (const conflict of conflicts) {
    const key = `${conflict.collection}|${conflict.id}|${conflict.field}`;
    const wahl = entscheidungen[key] ?? "lokal";
    const rows = [...((next[conflict.collection] ?? []) as unknown as Row[])];
    const index = rows.findIndex((row) => row.id === conflict.id);
    if (index === -1) continue;
    rows[index] = { ...rows[index], [conflict.field]: wahl === "lokal" ? conflict.lokal : conflict.entfernt };
    (next as unknown as Record<string, unknown>)[conflict.collection] = rows;
  }
  return next;
}

export function conflictKey(conflict: FieldConflict): string {
  return `${conflict.collection}|${conflict.id}|${conflict.field}`;
}
