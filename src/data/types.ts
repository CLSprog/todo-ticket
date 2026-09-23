// P08 ToDo-Ticket - Datenmodell nach Konzept V01-04, Anhang A.
//
// Grundsatz aus dem Konzept: technische englische Schluessel bleiben stabil,
// die sichtbaren deutschen Spaltennamen haengen im Feldkatalog daran (siehe
// src/export/feldkatalog.ts). Datumsfelder sind YYYY-MM-DD ohne Uhrzeit,
// Zeitstempel sind ISO-8601 in UTC. Leere optionale Werte sind null, nie 0
// und nie ein erfundenes Datum.

export type ID = string;
export type ISODate = string; // YYYY-MM-DD
export type ISOTimestamp = string; // ISO-8601, UTC

export type EntityType = "Ticket" | "Aufgabe";
export type Status = "Offen" | "In Bearbeitung" | "Erledigt";
export type Priority = "Hoch" | "Mittel" | "Niedrig";

/** Zuordnungsarten nach Anhang A, Blatt "Zuordnungen". */
export const ASSIGNMENT_KINDS = [
  "Projekt",
  "Thema",
  "Besprechungskreis",
  "Arbeitsart",
  "Abstimmung mit",
  "Auftraggeber",
  "Rückmeldung an",
] as const;
export type AssignmentKind = (typeof ASSIGNMENT_KINDS)[number];

/** Personenrollen fuer den Personenfilter (Kapitel 9). Lead steht im
 *  Datensatz selbst, die uebrigen drei sind Zuordnungen. */
export const PERSON_ROLES = ["Lead", "Auftraggeber", "Abstimmung mit", "Rückmeldung an"] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];

export const VALUE_GROUPS = [
  "Person",
  "Projekt",
  "Thema",
  "Besprechungskreis",
  "Arbeitsart",
  "Quellentyp",
  "Status",
  "Priorität",
] as const;
export type ValueGroup = (typeof VALUE_GROUPS)[number];

export const EVENT_KINDS = [
  "Erfassung",
  "Notiz",
  "Entscheidung",
  "Delegation",
  "Nachfrage",
  "Abschluss",
  "Wiederöffnung",
  "Änderung",
  "Löschung",
  "Erinnerung",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export type SuggestionState = "Offen" | "Bestätigt" | "Verworfen" | "Überholt";
export type RuleState = "Festgelegt" | "Vorschlag" | "Offen" | "Später";

/** Felder, die Ticket und Aufgabe gemeinsam haben. Bewusst identisch
 *  gehalten, damit Delegation, Abschluss und Wiederoeffnung auf beiden
 *  Ebenen mit derselben Logik arbeiten (Kapitel 6 bis 8). */
export interface WorkItem {
  id: ID;
  title: string;
  leadId: ID;
  dueDate: ISODate | null;
  priority: Priority;
  status: Status;
  description: string;
  currentState: string;
  result: string;
  startDate: ISODate;
  completedAt: ISOTimestamp | null;
  delegationRequiredAt: ISOTimestamp | null;
  delegationDueDate: ISODate | null;
  delegatedToId: ID | null;
  delegatedAt: ISOTimestamp | null;
  updatedAt: ISOTimestamp;
  revision: number;
  deletedAt: ISOTimestamp | null;
}

export interface Ticket extends WorkItem {
  /** Freitext-Ausloeser. Erzeugt ausdruecklich KEINE Person - eine bekannte
   *  Person wird zusaetzlich als Zuordnung "Auftraggeber" referenziert
   *  (Kapitel 14, Befund C-01). */
  trigger: string;
}

export interface Task extends WorkItem {
  ticketId: ID;
  /** Nur bei Folgeaufgabe: abgeschlossene Aufgabe desselben Tickets. */
  predecessorId: ID | null;
}

export interface Assignment {
  id: ID;
  entityType: EntityType;
  entityId: ID;
  kind: AssignmentKind;
  valueId: ID;
  updatedAt: ISOTimestamp;
  deletedAt: ISOTimestamp | null;
}

export interface TicketEvent {
  id: ID;
  entityType: EntityType;
  entityId: ID;
  at: ISOTimestamp;
  kind: EventKind;
  text: string;
  personId: ID | null;
  details: Record<string, unknown>;
  /** Nur bei Erinnerung: verhindert Doppelhinweise ueber Geraete hinweg. */
  notificationKey: string | null;
}

export interface Reference {
  id: ID;
  entityType: EntityType;
  entityId: ID;
  sourceType: string;
  label: string;
  uri: string;
  updatedAt: ISOTimestamp;
  deletedAt: ISOTimestamp | null;
}

export interface Suggestion {
  id: ID;
  entityType: EntityType;
  entityId: ID;
  field: string;
  value: unknown;
  reason: string;
  state: SuggestionState;
  baseRevision: number;
  createdAt: ISOTimestamp;
  decidedAt: ISOTimestamp | null;
}

export interface ValueItem {
  id: ID;
  group: ValueGroup;
  label: string;
  aliases: string[];
  active: boolean;
  sortOrder: number;
}

export interface Rule {
  id: string;
  name: string;
  state: RuleState;
  enabled: boolean;
  trigger: string;
  parameters: Record<string, unknown>;
  action: string;
  reason: string;
}

export interface Meta {
  schema: string;
  schemaVersion: string;
  conceptVersion: string;
  appVersion: string;
  generatedAt: ISOTimestamp;
  dataRevision: number;
  selfPersonId: ID;
  timezone: string;
  primaryStorage: string | null;
  [key: string]: unknown;
}

/** Der gesamte Datenbestand. Jede Sammlung ist ein Array von Zeilen mit
 *  stabiler id - genau die Form, die der 3-Wege-Abgleich in storage/sync.ts
 *  braucht. meta ist als einziges ein Objekt (Kapitel 15). */
export interface Database {
  meta: Meta;
  tickets: Ticket[];
  tasks: Task[];
  assignments: Assignment[];
  events: TicketEvent[];
  references: Reference[];
  suggestions: Suggestion[];
  values: ValueItem[];
  rules: Rule[];
  // Index-Signatur, damit die generischen Bausteine (B04-C04/C09, Datenbestand
  // = Record<string, unknown>) den Datenbestand ohne Umwandlung entgegennehmen.
  [key: string]: unknown;
}

/** Sammlungen, die zeilenweise abgeglichen werden. meta bleibt aussen vor. */
export const COLLECTIONS = [
  "tickets",
  "tasks",
  "assignments",
  "events",
  "references",
  "suggestions",
  "values",
  "rules",
] as const;
export type CollectionKey = (typeof COLLECTIONS)[number];

export type Row = { id: string } & Record<string, unknown>;

/** Deutsche Blattnamen fuer den Excel-Snapshot (Kapitel 14). */
export const SHEET_NAMES: Record<CollectionKey, string> = {
  tickets: "Tickets",
  tasks: "Aufgaben",
  assignments: "Zuordnungen",
  events: "Verlauf",
  references: "Referenzen",
  suggestions: "Vorschlaege",
  values: "Wertelisten",
  rules: "Regeln",
};

export const SELF_PERSON_ID = "PERSON_CLS";

// Versionsstand der laufenden App. Wird im Kopf der App und in den
// Einstellungen angezeigt (Clemens' Vorgabe vom 19.09.2026: eine
// Versionsnummer muss ueberall sichtbar sein, nicht nur in Dateinamen).
// Steigt bei jeder inhaltlichen Aenderung an der laufenden App - nicht bei
// Tippfehlerkorrekturen, und nicht schon dann, wenn nur ein Baustein in
// src/bausteine/ liegt, aber noch nicht eingebaut ist.
//   V01-01  Stand nach Arbeitspunkt 2 (sicheres Speichern)
//   V01-02  + Arbeitspunkt Schritt 1a: freie Namenseingabe in Personenfeldern
//   V01-03  + Pakete A-C (Erfassen/Bearbeiten, Finden/Assistenz, Sichern) und
//           Bausteine eingebaut (Schritt 7-9): C01/C04/C05/C06/C09 ersetzen
//           die P08-eigenen Nachbauten; lokal und OneDrive laufen jetzt durch
//           dasselbe Speicherwerk
export const APP_VERSION = "V01-03";
