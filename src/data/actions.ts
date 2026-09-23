// Fachliche Ablaeufe: Delegation, Abschluss, Folgeaufgabe, Wiederoeffnung.
//
// Jede Funktion nimmt den Datenbestand und gibt einen neuen zurueck. Sie
// schreibt die betroffene Zeile fort (revision, updatedAt) und legt den
// zugehoerigen Verlaufseintrag an. Der Verlauf wird ergaenzt, nie ueberschrieben.

import { createEvent, createReference, createTask, isRuleActive, touch, valueLabel } from "./db";
import { delegationDueDate, needsDelegation } from "./derive";
import { nowTimestamp, today } from "./dates";
import { SELF_PERSON_ID, type Database, type EntityType, type ID, type Task, type Ticket, type WorkItem } from "./types";

type Collection = "tickets" | "tasks";

function collectionOf(type: EntityType): Collection {
  return type === "Ticket" ? "tickets" : "tasks";
}

function replace<T extends WorkItem>(list: T[], item: T): T[] {
  return list.map((entry) => (entry.id === item.id ? item : entry));
}

/** Schreibt eine geaenderte Zeile samt Verlaufseintraegen zurueck. */
function commit(
  db: Database,
  type: EntityType,
  item: WorkItem,
  events: ReturnType<typeof createEvent>[],
): Database {
  const key = collectionOf(type);
  const next: Database = { ...db, events: [...db.events, ...events] };
  if (key === "tickets") next.tickets = replace(db.tickets, item as Ticket);
  else next.tasks = replace(db.tasks, item as Task);
  next.meta = { ...db.meta, dataRevision: db.meta.dataRevision + 1 };
  return next;
}

export function findItem(db: Database, type: EntityType, id: ID): WorkItem | undefined {
  return type === "Ticket" ? db.tickets.find((t) => t.id === id) : db.tasks.find((t) => t.id === id);
}

/** Feldaenderung mit Verlaufseintrag. Kosmetische Aenderungen setzen die
 *  Liegezeit (startDate) ausdruecklich nicht zurueck. */
export function updateItem(
  db: Database,
  type: EntityType,
  id: ID,
  patch: Partial<WorkItem & Ticket & Task>,
  note = "",
): Database {
  const current = findItem(db, type, id);
  if (!current) return db;

  let next = touch({ ...current, ...patch }) as WorkItem;
  const events = [];

  // D01/D04: Leadwechsel steuert den Delegationsbedarf.
  if (patch.leadId !== undefined && patch.leadId !== current.leadId) {
    if (current.delegatedAt) {
      // Bisherige Bestaetigung zuerst im Verlauf sichern, dann leeren.
      events.push(
        createEvent(type, id, "Delegation", "Lead gewechselt – bisherige Delegation archiviert", {
          vorherLead: current.leadId,
          delegatedToId: current.delegatedToId,
          delegatedAt: current.delegatedAt,
          neuerLead: patch.leadId,
        }),
      );
    }
    next = { ...next, delegatedToId: null, delegatedAt: null };
    if (patch.leadId === SELF_PERSON_ID) {
      // Rueckwechsel auf CLS: kein neuer Delegationsbedarf.
      next = { ...next, delegationRequiredAt: null, delegationDueDate: null };
    } else {
      const seit = nowTimestamp();
      next = {
        ...next,
        delegationRequiredAt: seit,
        delegationDueDate: delegationDueDate(db, next, today()),
      };
    }
  }

  // Neuer Solltermin begrenzt eine laufende Delegationsfrist nachtraeglich.
  if (patch.dueDate !== undefined && needsDelegation(next)) {
    next = { ...next, delegationDueDate: delegationDueDate(db, next, today()) };
  }

  events.push(
    createEvent(type, id, "Änderung", note || beschreibeAenderung(db, current, patch), {
      alt: Object.fromEntries(Object.keys(patch).map((k) => [k, (current as never)[k]])),
      neu: patch,
    }),
  );
  return commit(db, type, next, events);
}

function beschreibeAenderung(db: Database, current: WorkItem, patch: Partial<WorkItem>): string {
  const teile: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const alt = (current as never)[key];
    if (alt === value) continue;
    if (key === "leadId") teile.push(`Lead: ${valueLabel(db, alt as ID)} → ${valueLabel(db, value as ID)}`);
    else if (key === "dueDate") teile.push(`Solltermin: ${alt ?? "–"} → ${value ?? "–"}`);
    else if (key === "priority") teile.push(`Priorität: ${alt} → ${value}`);
    else if (key === "status") teile.push(`Status: ${alt} → ${value}`);
    else teile.push(`${key} geändert`);
  }
  return teile.join("; ") || "Geändert";
}

/** D03: Erst diese Bestaetigung protokolliert die Delegation. Ein erzeugter
 *  oder kopierter Mailtext tut es ausdruecklich nicht. */
export function confirmDelegation(
  db: Database,
  type: EntityType,
  id: ID,
  recipientId: ID,
  archivedText = "",
): Database {
  const current = findItem(db, type, id);
  if (!current) return db;
  const stamp = nowTimestamp();
  const next = touch({
    ...current,
    delegatedToId: recipientId,
    delegatedAt: stamp,
    status: current.status === "Erledigt" ? current.status : "In Bearbeitung",
  });
  const event = createEvent(
    type,
    id,
    "Delegation",
    `Delegation an ${valueLabel(db, recipientId)} bestätigt`,
    { delegatedToId: recipientId, delegatedAt: stamp, text: archivedText },
    recipientId,
  );
  return commit(db, type, next, [event]);
}

/** Erneut delegieren: bisherige Bestaetigung im Verlauf sichern, im Datensatz
 *  leeren, Frist neu setzen. Ein zweiter Klick bei bereits offener Delegation
 *  setzt die Frist NICHT zurueck. */
export function redelegate(db: Database, type: EntityType, id: ID): Database {
  const current = findItem(db, type, id);
  if (!current) return db;
  if (current.leadId === SELF_PERSON_ID) return db;
  if (needsDelegation(current)) return db;

  const seit = nowTimestamp();
  const next = touch({
    ...current,
    delegatedToId: null,
    delegatedAt: null,
    delegationRequiredAt: seit,
    delegationDueDate: delegationDueDate(db, current, today()),
  });
  const event = createEvent(type, id, "Delegation", "Erneute Delegation angefordert", {
    vorherDelegatedToId: current.delegatedToId,
    vorherDelegatedAt: current.delegatedAt,
  });
  return commit(db, type, next, [event]);
}

export interface CompleteResult {
  db: Database;
  /** Gesetzt, wenn A03 aktiv ist und offene Aufgaben den Abschluss stoppen. */
  blockedBy?: Task[];
}

/** A02: Der Abschluss geschieht bewusst durch den Benutzer. A03 kann ihn bei
 *  offenen Aufgaben stoppen - im Startumfang ist A03 aus (O-07 offen), dann
 *  bleibt es bei einem sichtbaren Hinweis. */
export function completeItem(db: Database, type: EntityType, id: ID, result = ""): CompleteResult {
  const current = findItem(db, type, id);
  if (!current) return { db };

  if (type === "Ticket" && isRuleActive(db, "A03")) {
    const offen = db.tasks.filter((task) => task.ticketId === id && !task.deletedAt && task.status !== "Erledigt");
    if (offen.length > 0) return { db, blockedBy: offen };
  }

  const stamp = nowTimestamp();
  const next = touch({
    ...current,
    status: "Erledigt" as const,
    completedAt: stamp,
    result: result || current.result,
  });
  const event = createEvent(type, id, "Abschluss", "Abgeschlossen", { completedAt: stamp, result });
  return { db: commit(db, type, next, [event]) };
}

/** A01: Abschluss und Folgeaufgabe in einem Schritt. Beides wird zusammen
 *  geschrieben; ein zweiter Klick auf denselben Vorgaenger erzeugt keinen
 *  zweiten Folgeschritt (T08/T19). */
export function completeWithFollowUp(
  db: Database,
  taskId: ID,
  followUp: { title: string; description?: string; leadId?: ID; dueDate?: string | null; priority?: Task["priority"] },
  result = "",
): Database {
  const current = db.tasks.find((task) => task.id === taskId);
  if (!current) return db;
  const bereitsVorhanden = db.tasks.some((task) => task.predecessorId === taskId && !task.deletedAt);
  if (bereitsVorhanden) return db;

  const stamp = nowTimestamp();
  const abgeschlossen = touch({
    ...current,
    status: "Erledigt" as const,
    completedAt: stamp,
    result: result || current.result,
  });

  const lead = followUp.leadId ?? current.leadId;
  const neu = createTask(current.ticketId, followUp.title, {
    predecessorId: taskId,
    description: followUp.description ?? "",
    leadId: lead,
    priority: followUp.priority ?? current.priority,
    dueDate: followUp.dueDate ?? null,
  });
  // Ein fremder Lead loest fuer den neuen Schritt erneut Delegationsbedarf aus;
  // Ergebnis, Abschluss- und Delegationswerte werden nicht kopiert.
  const neuMitFrist =
    lead === SELF_PERSON_ID
      ? neu
      : { ...neu, delegationRequiredAt: stamp, delegationDueDate: delegationDueDate(db, neu, today()) };

  return {
    ...db,
    tasks: [...replace(db.tasks, abgeschlossen), neuMitFrist],
    events: [
      ...db.events,
      createEvent("Aufgabe", taskId, "Abschluss", "Schritt erledigt", { completedAt: stamp, result }),
      createEvent("Aufgabe", neuMitFrist.id, "Erfassung", "Folgeaufgabe angelegt", { predecessorId: taskId }),
    ],
    meta: { ...db.meta, dataRevision: db.meta.dataRevision + 1 },
  };
}

/** D05: Wiederoeffnung. Der urspruengliche Abschluss bleibt im Verlauf; bei
 *  unveraendertem fremdem Lead bleibt die bestaetigte Delegation gueltig. */
export function reopenItem(db: Database, type: EntityType, id: ID, grund = ""): Database {
  const current = findItem(db, type, id);
  if (!current) return db;
  const behaeltDelegation =
    isRuleActive(db, "D05") && current.leadId !== SELF_PERSON_ID && current.delegatedAt !== null;
  const next = touch({
    ...current,
    status: behaeltDelegation ? ("In Bearbeitung" as const) : ("Offen" as const),
    completedAt: null,
  });
  const event = createEvent(type, id, "Wiederöffnung", grund || "Wieder geöffnet", {
    vorherCompletedAt: current.completedAt,
    vorherResult: current.result,
    delegationErhalten: behaeltDelegation,
  });
  return commit(db, type, next, [event]);
}

export function addNote(db: Database, type: EntityType, id: ID, text: string, personId: ID | null = null): Database {
  if (!text.trim()) return db;
  return {
    ...db,
    events: [...db.events, createEvent(type, id, "Notiz", text.trim(), {}, personId)],
    meta: { ...db.meta, dataRevision: db.meta.dataRevision + 1 },
  };
}

/** Nachverfolgung (Paket A): reiner Verlaufseintrag, kein Automatikversand.
 *  Loest keine erneute Delegation aus - dafuer gibt es "Erneut delegieren". */
export function recordFollowUp(db: Database, type: EntityType, id: ID, text: string): Database {
  const current = findItem(db, type, id);
  if (!current) return db;
  const event = createEvent(type, id, "Nachfrage", text.trim() || "Nachfrage vermerkt", {}, current.leadId);
  return {
    ...db,
    events: [...db.events, event],
    meta: { ...db.meta, dataRevision: db.meta.dataRevision + 1 },
  };
}

/** Quelle/Verweis anlegen (Paket A). Nur Link/Fundstelle als Text - keine
 *  Dateiuebernahme, siehe P08_Umsetzungsvorschlag-A-D V01-00. */
export function addReference(
  db: Database,
  type: EntityType,
  id: ID,
  label: string,
  uri: string,
): Database {
  if (!label.trim() && !uri.trim()) return db;
  const reference = createReference(type, id, label, uri);
  return {
    ...db,
    references: [...db.references, reference],
    meta: { ...db.meta, dataRevision: db.meta.dataRevision + 1 },
  };
}

export function removeReference(db: Database, referenceId: ID): Database {
  const vorhanden = db.references.some((r) => r.id === referenceId);
  if (!vorhanden) return db;
  const stamp = nowTimestamp();
  return {
    ...db,
    references: db.references.map((r) => (r.id === referenceId ? { ...r, deletedAt: stamp, updatedAt: stamp } : r)),
    meta: { ...db.meta, dataRevision: db.meta.dataRevision + 1 },
  };
}

/** Loeschen ist getrennt vom Abschluss und bleibt fuer die Synchronisation
 *  nachvollziehbar - die Zeile bleibt mit deletedAt stehen. */
export function softDelete(db: Database, type: EntityType, id: ID): Database {
  const current = findItem(db, type, id);
  if (!current) return db;
  const stamp = nowTimestamp();
  const next = touch({ ...current, deletedAt: stamp });
  const events = [createEvent(type, id, "Löschung", "Gelöscht", { deletedAt: stamp })];
  let db2 = commit(db, type, next, events);
  if (type === "Ticket") {
    db2 = {
      ...db2,
      tasks: db2.tasks.map((task) => (task.ticketId === id && !task.deletedAt ? { ...task, deletedAt: stamp } : task)),
    };
  }
  return db2;
}
