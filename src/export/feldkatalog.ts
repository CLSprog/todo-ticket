// Zuordnung technischer JSON-Schluessel zu den sichtbaren deutschen
// Spaltennamen (Konzept Anhang A). Sie ist die einzige Stelle, an der beide
// Namen zusammengefuehrt werden - Export und Import lesen sie beide, damit
// der Roundtrip verlustfrei bleibt (Kapitel 15, Abnahmetest T16).

import type { CollectionKey } from "../data/types";

export interface FieldDef {
  key: string;
  label: string;
  /** true = Wert ist ein Datum (YYYY-MM-DD) und wird als echter Excel-Datumswert geschrieben. */
  date?: boolean;
  /** true = Wert wird als JSON-Text geschrieben und beim Import zurueckgelesen. */
  json?: boolean;
}

const WORKITEM_TAIL: FieldDef[] = [
  { key: "currentState", label: "Aktueller Stand" },
  { key: "result", label: "Ergebnis" },
  { key: "startDate", label: "Startdatum", date: true },
  { key: "completedAt", label: "Erledigt am" },
  { key: "delegationRequiredAt", label: "Delegation erforderlich seit" },
  { key: "delegationDueDate", label: "Delegation bis", date: true },
  { key: "delegatedToId", label: "Delegiert an" },
  { key: "delegatedAt", label: "Delegiert am" },
  { key: "updatedAt", label: "Letzte Änderung" },
  { key: "revision", label: "Revision" },
  { key: "deletedAt", label: "Gelöscht am" },
];

export const FIELD_CATALOG: Record<CollectionKey, FieldDef[]> = {
  tickets: [
    { key: "id", label: "Ticket-ID" },
    { key: "title", label: "Titel" },
    { key: "leadId", label: "Lead" },
    { key: "dueDate", label: "Solltermin", date: true },
    { key: "priority", label: "Priorität" },
    { key: "status", label: "Status" },
    { key: "description", label: "Beschreibung" },
    { key: "trigger", label: "Auslöser / Auftraggeber" },
    ...WORKITEM_TAIL,
  ],
  tasks: [
    { key: "id", label: "Aufgaben-ID" },
    { key: "ticketId", label: "Ticket-ID" },
    { key: "predecessorId", label: "Vorgängeraufgaben-ID" },
    { key: "title", label: "Titel" },
    { key: "leadId", label: "Lead" },
    { key: "dueDate", label: "Solltermin", date: true },
    { key: "priority", label: "Priorität" },
    { key: "status", label: "Status" },
    { key: "description", label: "Beschreibung" },
    ...WORKITEM_TAIL,
  ],
  assignments: [
    { key: "id", label: "Zuordnungs-ID" },
    { key: "entityType", label: "Objekttyp" },
    { key: "entityId", label: "Objekt-ID" },
    { key: "kind", label: "Zuordnungsart" },
    { key: "valueId", label: "Wert-ID" },
    { key: "updatedAt", label: "Letzte Änderung" },
    { key: "deletedAt", label: "Gelöscht am" },
  ],
  events: [
    { key: "id", label: "Ereignis-ID" },
    { key: "entityType", label: "Objekttyp" },
    { key: "entityId", label: "Objekt-ID" },
    { key: "at", label: "Zeitpunkt" },
    { key: "kind", label: "Ereignisart" },
    { key: "text", label: "Eintrag" },
    { key: "personId", label: "Beteiligte Person-ID" },
    { key: "details", label: "Details JSON", json: true },
    { key: "notificationKey", label: "Erinnerungsschlüssel" },
  ],
  references: [
    { key: "id", label: "Referenz-ID" },
    { key: "entityType", label: "Objekttyp" },
    { key: "entityId", label: "Objekt-ID" },
    { key: "sourceType", label: "Quellentyp" },
    { key: "label", label: "Bezeichnung" },
    { key: "uri", label: "Link / Dateireferenz" },
    { key: "updatedAt", label: "Letzte Änderung" },
    { key: "deletedAt", label: "Gelöscht am" },
  ],
  suggestions: [
    { key: "id", label: "Vorschlags-ID" },
    { key: "entityType", label: "Objekttyp" },
    { key: "entityId", label: "Objekt-ID" },
    { key: "field", label: "Zielfeld / Zuordnungsart" },
    { key: "value", label: "Vorgeschlagener Wert JSON", json: true },
    { key: "reason", label: "Begründung / Beleg" },
    { key: "state", label: "Prüfstatus" },
    { key: "baseRevision", label: "Bezugsrevision" },
    { key: "createdAt", label: "Erstellt am" },
    { key: "decidedAt", label: "Geprüft am" },
  ],
  values: [
    { key: "id", label: "Wert-ID" },
    { key: "group", label: "Gruppe" },
    { key: "label", label: "Bezeichnung" },
    { key: "aliases", label: "Aliasse JSON", json: true },
    { key: "active", label: "Aktiv" },
    { key: "sortOrder", label: "Reihenfolge" },
  ],
  rules: [
    { key: "id", label: "Regel-ID" },
    { key: "name", label: "Bezeichnung" },
    { key: "state", label: "Festlegungsstand" },
    { key: "enabled", label: "Aktiv" },
    { key: "trigger", label: "Auslöser" },
    { key: "parameters", label: "Parameter JSON", json: true },
    { key: "action", label: "Wirkung" },
    { key: "reason", label: "Begründung" },
  ],
};

/** Graue Anzeigespalten aus Zuordnungen (Kapitel 14, Befund C-01/C-03).
 *  Werden beim Export erzeugt und beim Import ausdruecklich ignoriert. */
export const DISPLAY_COLUMNS = [
  "Projekt(e)",
  "Auftraggeber",
  "Abstimmung mit",
  "Thema / Kategorie",
  "Besprechungskreis",
  "Arbeitsart",
  "Rückmeldung an",
] as const;

export const DISPLAY_KINDS = [
  "Projekt",
  "Auftraggeber",
  "Abstimmung mit",
  "Thema",
  "Besprechungskreis",
  "Arbeitsart",
  "Rückmeldung an",
] as const;
