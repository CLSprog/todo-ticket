// Anlegen und Veraendern des Datenbestands.
//
// Jede Aenderung geht durch die Funktionen hier, damit revision, updatedAt
// und der Verlauf verlaesslich mitlaufen (Kapitel 16/17). Geloescht wird
// ausschliesslich als Markierung (deletedAt), nie durch Entfernen der Zeile -
// sonst taucht der Eintrag beim naechsten Offline-Abgleich wieder auf.

import { SEED_RULES, SEED_VALUES } from "./seed";
import { nowTimestamp, today } from "./dates";
import {
  APP_VERSION,
  SELF_PERSON_ID,
  type Assignment,
  type AssignmentKind,
  type Database,
  type EntityType,
  type EventKind,
  type ID,
  type Meta,
  type Priority,
  type Reference,
  type Task,
  type Ticket,
  type TicketEvent,
  type WorkItem,
} from "./types";

export function newId(): ID {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyDatabase(): Database {
  const meta: Meta = {
    schema: "P08_ToDo-Ticket",
    schemaVersion: "1.0",
    conceptVersion: "V01-04",
    appVersion: APP_VERSION,
    generatedAt: nowTimestamp(),
    dataRevision: 0,
    selfPersonId: SELF_PERSON_ID,
    timezone: "Europe/Vienna",
    primaryStorage: null,
    holidays: [] as string[],
  };
  return {
    meta,
    tickets: [],
    tasks: [],
    assignments: [],
    events: [],
    references: [],
    suggestions: [],
    values: SEED_VALUES.map((value) => ({ ...value })),
    rules: SEED_RULES.map((rule) => ({ ...rule, parameters: { ...rule.parameters } })),
  };
}

function baseWorkItem(title: string, leadId: ID, priority: Priority): WorkItem {
  const stamp = nowTimestamp();
  return {
    id: newId(),
    title: title.trim(),
    leadId,
    dueDate: null,
    priority,
    status: "Offen",
    description: "",
    currentState: "",
    result: "",
    startDate: today(),
    completedAt: null,
    delegationRequiredAt: null,
    delegationDueDate: null,
    delegatedToId: null,
    delegatedAt: null,
    updatedAt: stamp,
    revision: 1,
    deletedAt: null,
  };
}

/** T01: Ein Titel genuegt. Alles andere ist Vorbelegung oder bleibt leer -
 *  es wird insbesondere kein Solltermin erfunden. */
export function createTicket(title: string, overrides: Partial<Ticket> = {}): Ticket {
  return {
    ...baseWorkItem(title, SELF_PERSON_ID, "Mittel"),
    trigger: "",
    ...overrides,
  };
}

export function createTask(ticketId: ID, title: string, overrides: Partial<Task> = {}): Task {
  return {
    ...baseWorkItem(title, SELF_PERSON_ID, "Mittel"),
    ticketId,
    predecessorId: null,
    ...overrides,
  };
}

export function createEvent(
  entityType: EntityType,
  entityId: ID,
  kind: EventKind,
  text: string,
  details: Record<string, unknown> = {},
  personId: ID | null = null,
): TicketEvent {
  return {
    id: newId(),
    entityType,
    entityId,
    at: nowTimestamp(),
    kind,
    text,
    personId,
    details,
    notificationKey: null,
  };
}

export function createAssignment(
  entityType: EntityType,
  entityId: ID,
  kind: AssignmentKind,
  valueId: ID,
): Assignment {
  return {
    id: newId(),
    entityType,
    entityId,
    kind,
    valueId,
    updatedAt: nowTimestamp(),
    deletedAt: null,
  };
}

/** Quelle/Verweis (Paket A): nur ein Link oder eine Fundstelle als Text, keine
 *  Dateiuebernahme - siehe P08_Umsetzungsvorschlag-A-D V01-00. */
export function createReference(
  entityType: EntityType,
  entityId: ID,
  label: string,
  uri: string,
  sourceType = "Link",
): Reference {
  return {
    id: newId(),
    entityType,
    entityId,
    sourceType,
    label: label.trim(),
    uri: uri.trim(),
    updatedAt: nowTimestamp(),
    deletedAt: null,
  };
}

/** Hebt revision und updatedAt an. Wird bei jeder inhaltlichen Aenderung
 *  aufgerufen; ein reiner Export darf die Revision nicht anheben. */
export function touch<T extends WorkItem>(item: T): T {
  return { ...item, updatedAt: nowTimestamp(), revision: item.revision + 1 };
}

export function activeTickets(db: Database): Ticket[] {
  return db.tickets.filter((ticket) => !ticket.deletedAt);
}

export function activeTasks(db: Database): Task[] {
  return db.tasks.filter((task) => !task.deletedAt);
}

export function tasksOfTicket(db: Database, ticketId: ID): Task[] {
  return activeTasks(db).filter((task) => task.ticketId === ticketId);
}

export function eventsOf(db: Database, entityId: ID): TicketEvent[] {
  return db.events
    .filter((event) => event.entityId === entityId)
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function referencesOf(db: Database, entityId: ID): Reference[] {
  return db.references.filter((ref) => ref.entityId === entityId && !ref.deletedAt);
}

export function assignmentsOf(db: Database, entityId: ID): Assignment[] {
  return db.assignments.filter((a) => a.entityId === entityId && !a.deletedAt);
}

export function valueLabel(db: Database, valueId: ID | null): string {
  if (!valueId) return "";
  return db.values.find((value) => value.id === valueId)?.label ?? valueId;
}

export function valuesOfGroup(db: Database, group: string, includeInactive = false) {
  return db.values
    .filter((value) => value.group === group && (includeInactive || value.active))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

export function ruleById(db: Database, id: string) {
  return db.rules.find((rule) => rule.id === id);
}

export function isRuleActive(db: Database, id: string): boolean {
  return ruleById(db, id)?.enabled === true;
}

export function ruleParam<T>(db: Database, id: string, key: string, fallback: T): T {
  const value = ruleById(db, id)?.parameters?.[key];
  return (value === undefined || value === null ? fallback : value) as T;
}

export function holidays(db: Database): string[] {
  const list = db.meta.holidays;
  return Array.isArray(list) ? (list as string[]) : [];
}
