// Situationsfilter (Kapitel 9).
//
// Zwischen unterschiedlichen Filtergruppen gilt UND, innerhalb einer
// Mehrfachauswahl ODER. Ein Ticket erscheint mit seinen passenden Aufgaben -
// mehrere Treffer erzeugen ausdruecklich keine mehrfachen Haupttickets.
// Globale Fristhinweise bleiben sichtbar, auch wenn der Kontext eng ist.

import { assignmentValueIds, hintsFor, isOpen, matchesPerson } from "./derive";
import { tasksOfTicket } from "./db";
import type { AssignmentKind, Database, ID, PersonRole, Task, Ticket, WorkItem } from "./types";

export type QuickView =
  | "alle"
  | "offen"
  | "inBearbeitung"
  | "erledigt"
  | "heute"
  | "ueberfaellig"
  | "zuDelegieren"
  | "ohneZuordnung";

export interface FilterState {
  text: string;
  quick: QuickView;
  projekte: ID[];
  themen: ID[];
  besprechungen: ID[];
  arbeitsarten: ID[];
  person: ID | null;
  personRolle: PersonRole | "Alle";
  prioritaeten: string[];
}

export const LEERER_FILTER: FilterState = {
  text: "",
  quick: "offen",
  projekte: [],
  themen: [],
  besprechungen: [],
  arbeitsarten: [],
  person: null,
  personRolle: "Alle",
  prioritaeten: [],
};

export function filterAktiv(filter: FilterState): boolean {
  return (
    filter.text.trim() !== "" ||
    filter.projekte.length > 0 ||
    filter.themen.length > 0 ||
    filter.besprechungen.length > 0 ||
    filter.arbeitsarten.length > 0 ||
    filter.person !== null ||
    filter.prioritaeten.length > 0
  );
}

function passtZuordnung(
  db: Database,
  item: WorkItem,
  ticketId: ID | undefined,
  kind: AssignmentKind,
  gewaehlt: ID[],
): boolean {
  if (gewaehlt.length === 0) return true;
  const vorhanden = assignmentValueIds(db, item.id, kind, ticketId);
  return gewaehlt.some((id) => vorhanden.includes(id));
}

/** Inhaltssuche ueber Titel, Beschreibung und Verlauf (Kapitel 9). */
function passtText(db: Database, item: WorkItem, suche: string): boolean {
  if (!suche) return true;
  const begriff = suche.toLowerCase();
  if (item.title.toLowerCase().includes(begriff)) return true;
  if (item.description.toLowerCase().includes(begriff)) return true;
  if (item.currentState.toLowerCase().includes(begriff)) return true;
  if (item.result.toLowerCase().includes(begriff)) return true;
  return db.events.some((event) => event.entityId === item.id && event.text.toLowerCase().includes(begriff));
}

function passtSchnellansicht(db: Database, item: WorkItem, ticketId: ID | undefined, quick: QuickView): boolean {
  const hints = hintsFor(db, item);
  switch (quick) {
    case "alle":
      return true;
    case "offen":
      return isOpen(item);
    case "inBearbeitung":
      return item.status === "In Bearbeitung";
    case "erledigt":
      return item.status === "Erledigt";
    case "heute":
      return hints.some((h) => h.label === "Heute fällig");
    case "ueberfaellig":
      return hints.some((h) => h.label === "Überfällig");
    case "zuDelegieren":
      return hints.some((h) => h.ruleId === "D01");
    case "ohneZuordnung":
      return assignmentValueIds(db, item.id, "Projekt", ticketId).length === 0;
    default:
      return true;
  }
}

export function passt(db: Database, item: WorkItem, ticketId: ID | undefined, filter: FilterState): boolean {
  if (item.deletedAt) return false;
  if (!passtSchnellansicht(db, item, ticketId, filter.quick)) return false;
  if (!passtText(db, item, filter.text.trim().toLowerCase())) return false;
  if (filter.prioritaeten.length > 0 && !filter.prioritaeten.includes(item.priority)) return false;
  if (!passtZuordnung(db, item, ticketId, "Projekt", filter.projekte)) return false;
  if (!passtZuordnung(db, item, ticketId, "Thema", filter.themen)) return false;
  if (!passtZuordnung(db, item, ticketId, "Besprechungskreis", filter.besprechungen)) return false;
  if (!passtZuordnung(db, item, ticketId, "Arbeitsart", filter.arbeitsarten)) return false;
  if (filter.person && !matchesPerson(db, item, ticketId, filter.person, filter.personRolle)) return false;
  return true;
}

export interface Treffer {
  ticket: Ticket;
  /** Die Aufgaben, die selbst passen. Leer, wenn nur das Ticket passt. */
  aufgaben: Task[];
  /** true, wenn das Ticket selbst dem Filter entspricht. */
  ticketPasst: boolean;
}

/** Liefert je Ticket genau einen Treffer, mit den passenden Aufgaben darunter. */
export function suche(db: Database, filter: FilterState): Treffer[] {
  const ergebnis: Treffer[] = [];
  for (const ticket of db.tickets) {
    if (ticket.deletedAt) continue;
    const aufgaben = tasksOfTicket(db, ticket.id).filter((task) => passt(db, task, ticket.id, filter));
    const ticketPasst = passt(db, ticket, undefined, filter);
    if (!ticketPasst && aufgaben.length === 0) continue;
    ergebnis.push({ ticket, aufgaben, ticketPasst });
  }
  return ergebnis;
}
