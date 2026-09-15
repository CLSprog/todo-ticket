// Datenmodell ToDo-Liste_Ticket (P08)

export type Status = "offen" | "in_bearbeitung" | "erledigt";
export type Prioritaet = "niedrig" | "mittel" | "hoch";

export interface Eintrag {
  id: string;
  titel: string;
  projekt: string;
  lead: string;
  ausloeser: string;
  abstimmung: string;
  termin: string | null; // ISO-Datum YYYY-MM-DD
  prioritaet: Prioritaet;
  beschreibung: string;
  status: Status;
  erledigtAm: string | null;
  vorgangsnummer: string;
  createdAt: string; // ISO-Zeitstempel
  updatedAt: string; // ISO-Zeitstempel, fuer Konfliktabgleich beim Sync
}

export type NeuerEintrag = Omit<
  Eintrag,
  "id" | "status" | "erledigtAm" | "vorgangsnummer" | "createdAt" | "updatedAt"
>;

export const PROJECTS = ["ZNA", "LAB", "KFN", "WHF", "MGZ", "AWB", "XXX"] as const;

export type Filter = "offen" | "ueberfaellig" | "heute" | "erledigt" | "alle";
