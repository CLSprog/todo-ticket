// Abgeleitete Hinweise und Reihung.
//
// Alles hier wird live berechnet und NICHT gespeichert. "Noch zu delegieren",
// "ueberfaellig" und "Nachfrage faellig" sind ausdruecklich keine zusaetzlichen
// Hauptstatuswerte (Kapitel 8), sondern Hinweise auf den drei echten Status
// Offen / In Bearbeitung / Erledigt.

import { addWorkingDays, daysBetween, today, workingDaysBetween } from "./dates";
import { assignmentsOf, holidays, isRuleActive, ruleParam } from "./db";
import type {
  AssignmentKind,
  Database,
  ID,
  ISODate,
  PersonRole,
  Task,
  Ticket,
  WorkItem,
} from "./types";
import { SELF_PERSON_ID } from "./types";

export type HintLevel = "dringend" | "warnung" | "info";

export interface Hint {
  level: HintLevel;
  /** Kurzform fuer die Liste. */
  label: string;
  /** Begruendung - das Konzept verlangt, dass der Grund genannt wird
   *  (Kapitel 10), nicht nur eine Sortierposition. */
  reason: string;
  ruleId: string;
}

export interface Ranked<T extends WorkItem> {
  item: T;
  hints: Hint[];
  score: number;
  /** Die Begruendung, die in der Assistenzliste angezeigt wird. */
  reason: string;
}

export function isOpen(item: WorkItem): boolean {
  return item.status !== "Erledigt" && !item.deletedAt;
}

/** D01: Lead ungleich CLS bedeutet Delegationsbedarf, solange die Uebergabe
 *  nicht bestaetigt ist. Das Kopieren eines Mailtexts zaehlt nicht. */
export function needsDelegation(item: WorkItem): boolean {
  return isOpen(item) && item.leadId !== SELF_PERSON_ID && !item.delegatedAt;
}

/** D02: interne Kurzfrist fuer die Uebergabe. Rechnet in Arbeitstagen
 *  (Entscheidung V01-01) und wird durch einen frueheren Solltermin begrenzt. */
export function delegationDueDate(db: Database, item: WorkItem, from: ISODate): ISODate | null {
  if (!isRuleActive(db, "D02")) return null;
  const offset = ruleParam<number>(db, "D02", "offsetDays", 1);
  const basis = ruleParam<string>(db, "D02", "dayBasis", "Arbeitstag");
  const capAtDueDate = ruleParam<boolean>(db, "D02", "capAtDueDate", true);
  const due =
    basis === "Arbeitstag"
      ? addWorkingDays(from, offset, holidays(db))
      : addWorkingDays(from, offset, []);
  if (capAtDueDate && item.dueDate && daysBetween(item.dueDate, due) > 0) return item.dueDate;
  return due;
}

export function hintsFor(db: Database, item: WorkItem): Hint[] {
  const hints: Hint[] = [];
  if (!isOpen(item)) return hints;
  const heute = today();

  if (needsDelegation(item)) {
    const frist = item.delegationDueDate;
    const ueberfaellig = frist !== null && daysBetween(frist, heute) > 0;
    hints.push({
      level: "dringend",
      label: "Noch zu delegieren",
      reason: frist
        ? ueberfaellig
          ? `Übergabe war bis ${frist} durchzuführen`
          : `Übergabe bis ${frist} durchführen`
        : "Übergabe noch nicht bestätigt",
      ruleId: "D01",
    });
  }

  // E02: heute faellig / ueberfaellig anhand des Solltermins.
  if (item.dueDate && isRuleActive(db, "E02")) {
    const abstand = daysBetween(heute, item.dueDate);
    if (abstand < 0) {
      hints.push({
        level: "dringend",
        label: "Überfällig",
        reason: `Solltermin war ${item.dueDate}`,
        ruleId: "E02",
      });
    } else if (abstand === 0) {
      hints.push({ level: "warnung", label: "Heute fällig", reason: "Solltermin ist heute", ruleId: "E02" });
    } else if (isRuleActive(db, "E01")) {
      // E01: Hinweis 3/2/1/0 Arbeitstage vor dem Solltermin.
      const schwellen = ruleParam<number[]>(db, "E01", "businessDaysBefore", [3, 2, 1, 0]);
      const rest = workingDaysBetween(heute, item.dueDate, holidays(db));
      if (schwellen.includes(rest)) {
        hints.push({
          level: "warnung",
          label: `Solltermin in ${rest} Arbeitstagen`,
          reason: `Solltermin ${item.dueDate}${item.delegatedAt ? " – Nachfrage sinnvoll" : ""}`,
          ruleId: "E01",
        });
      }
    }
  }

  // E03: Alterung ohne Solltermin, 20 Arbeitstage.
  if (!item.dueDate && isRuleActive(db, "E03")) {
    const schwelle = ruleParam<number>(db, "E03", "businessDaysWithoutDueDate", 20);
    const alter = workingDaysBetween(item.startDate, heute, holidays(db));
    if (alter >= schwelle) {
      hints.push({
        level: "info",
        label: "Liegt lange",
        reason: `Seit ${alter} Arbeitstagen ohne Solltermin offen`,
        ruleId: "E03",
      });
    }
  }

  return hints;
}

/** Effektive Zuordnungen einer Aufgabe: eigene plus die des Tickets, je Art
 *  vereinigt und nach Wert-ID dedupliziert. Die Herkunft bleibt sichtbar
 *  (Befund C-03). Ein Ausschliessen geerbter Werte ist nicht vorgesehen. */
export interface EffectiveAssignment {
  kind: AssignmentKind;
  valueId: ID;
  origin: "Aufgabe" | "Ticket";
}

export function effectiveAssignments(db: Database, entityId: ID, ticketId?: ID): EffectiveAssignment[] {
  const own = assignmentsOf(db, entityId).map<EffectiveAssignment>((a) => ({
    kind: a.kind,
    valueId: a.valueId,
    origin: "Aufgabe",
  }));
  if (!ticketId) return own.map((a) => ({ ...a, origin: "Ticket" }));
  const inherited = assignmentsOf(db, ticketId).map<EffectiveAssignment>((a) => ({
    kind: a.kind,
    valueId: a.valueId,
    origin: "Ticket",
  }));
  const seen = new Set(own.map((a) => `${a.kind}|${a.valueId}`));
  return [...own, ...inherited.filter((a) => !seen.has(`${a.kind}|${a.valueId}`))];
}

export function assignmentValueIds(
  db: Database,
  entityId: ID,
  kind: AssignmentKind,
  ticketId?: ID,
): ID[] {
  return effectiveAssignments(db, entityId, ticketId)
    .filter((a) => a.kind === kind)
    .map((a) => a.valueId);
}

/** Personenfilter: eine konkrete Rolle oder alle Rollen (Kapitel 9).
 *  Historische Beteiligung im Verlauf ist ausdruecklich KEIN Rollenfilter. */
export function matchesPerson(
  db: Database,
  item: WorkItem,
  ticketId: ID | undefined,
  personId: ID,
  role: PersonRole | "Alle",
): boolean {
  const rollen: PersonRole[] = role === "Alle" ? ["Lead", "Auftraggeber", "Abstimmung mit", "Rückmeldung an"] : [role];
  for (const r of rollen) {
    if (r === "Lead") {
      if (item.leadId === personId) return true;
      continue;
    }
    if (assignmentValueIds(db, item.id, r, ticketId).includes(personId)) return true;
  }
  return false;
}

/** K02: Kontextreihung. Reihenfolge der Gruende ist ein Parameter, kein
 *  verstecktes Punktesystem - die Begruendung wird mit angezeigt. */
export function rank<T extends WorkItem>(db: Database, items: T[]): Ranked<T>[] {
  const order = ruleParam<string[]>(db, "K02", "order", [
    "overdue",
    "delegation",
    "dueSoon",
    "age",
    "priority",
  ]);
  const heute = today();
  const prioRang: Record<string, number> = { Hoch: 0, Mittel: 1, Niedrig: 2 };

  const gewicht = (grund: string) => {
    const index = order.indexOf(grund);
    return index === -1 ? order.length : index;
  };

  return items
    .map((item) => {
      const hints = hintsFor(db, item);
      const ueberfaellig = hints.some((h) => h.ruleId === "E02" && h.label === "Überfällig");
      const delegation = hints.some((h) => h.ruleId === "D01");
      const baldFaellig = hints.some((h) => h.label === "Heute fällig" || h.ruleId === "E01");

      let gruppe = order.length;
      let reason = "";
      if (ueberfaellig) {
        gruppe = gewicht("overdue");
        reason = hints.find((h) => h.label === "Überfällig")?.reason ?? "Überfällig";
      } else if (delegation) {
        gruppe = gewicht("delegation");
        reason = hints.find((h) => h.ruleId === "D01")?.reason ?? "Delegation noch offen";
      } else if (baldFaellig) {
        gruppe = gewicht("dueSoon");
        reason = hints.find((h) => h.ruleId === "E01" || h.label === "Heute fällig")?.reason ?? "";
      } else if (hints.some((h) => h.ruleId === "E03")) {
        gruppe = gewicht("age");
        reason = hints.find((h) => h.ruleId === "E03")?.reason ?? "";
      } else {
        gruppe = gewicht("priority");
        reason = `Priorität ${item.priority}`;
      }

      const alter = daysBetween(item.startDate, heute);
      const score = gruppe * 10_000 + prioRang[item.priority] * 1_000 - Math.min(alter, 999);
      return { item, hints, score, reason };
    })
    .sort((a, b) => a.score - b.score || a.item.title.localeCompare(b.item.title));
}

/** Kapitel 10: Hat ein Ticket konkrete offene Aufgaben, schlaegt die
 *  Assistenz diese naechsten Aktionen vor, nicht das Ticket selbst - der
 *  Ticket-Solltermin bleibt daneben eigenstaendig ueberwacht. */
export function assistanceItems(
  db: Database,
  tickets: Ticket[],
  tasks: Task[],
): Ranked<WorkItem>[] {
  const ticketsMitOffenenAufgaben = new Set(
    tasks.filter((task) => isOpen(task)).map((task) => task.ticketId),
  );
  const offeneTickets = tickets.filter(
    (ticket) => isOpen(ticket) && (!ticketsMitOffenenAufgaben.has(ticket.id) || ticket.dueDate),
  );
  const offeneAufgaben = tasks.filter((task) => isOpen(task));
  return rank<WorkItem>(db, [...offeneTickets, ...offeneAufgaben]);
}
