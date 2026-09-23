// Regelbasierte Vorschlaege (K01, Paket B).
//
// Zwei Arten: Zuordnungsvorschlag per Stichwortabgleich (Titel/Ausloeser
// gegen Bezeichnung und Aliasse der Wertelisten Projekt/Thema/
// Besprechungskreis/Arbeitsart) und Dublettenverdacht bei sehr aehnlichem,
// bereits offenem Titel derselben Art. Beides laeuft ueber dieselbe
// Suggestion-Tabelle und dieselbe Regel K01: "Vorschlag markiert und
// getrennt speichern; bestaetigen, aendern, verwerfen oder ignorieren" - eine
// Zuordnung wird also NIE automatisch gesetzt, erst beim Bestaetigen.
//
// Vorschlaege werden bewusst nur bei Erfassung und auf ausdruecklichen
// Wunsch ("Vorschlaege pruefen") neu ermittelt, nicht laufend im Hintergrund -
// das haelt die Liste vorhersehbar und vermeidet staendig wechselnde Vorschlaege
// waehrend des Tippens.

import { activeTasks, activeTickets, createAssignment, isRuleActive, newId, valuesOfGroup } from "./db";
import { effectiveAssignments, isOpen } from "./derive";
import { nowTimestamp } from "./dates";
import type { AssignmentKind, Database, EntityType, ID, Suggestion, Task, Ticket, WorkItem } from "./types";

const ZUORDNUNGSARTEN: AssignmentKind[] = ["Projekt", "Thema", "Besprechungskreis", "Arbeitsart"];

/** Vergleichsform wie im Personenfeld: getrimmt, Mehrfachleerzeichen weg, klein. */
function vergleichsform(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Trefferpruefung mit Wortgrenzen, damit z.B. "KI" nicht in "Klinik" anschlaegt. */
function enthaeltBegriff(text: string, begriff: string): boolean {
  const b = vergleichsform(begriff);
  if (!b) return false;
  const muster = new RegExp(`(^|[^a-zäöüß0-9])${escapeRegExp(b)}([^a-zäöüß0-9]|$)`, "i");
  return muster.test(text);
}

function textVon(type: EntityType, item: WorkItem): string {
  const teile = [item.title];
  if (type === "Ticket") teile.push((item as Ticket).trigger ?? "");
  return vergleichsform(teile.join(" "));
}

function aehnlicheTitel(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.length >= 8 && b.length >= 8 && (a.includes(b) || b.includes(a));
}

/** Zuordnungsvorschlaege per Stichwortabgleich. Bereits gesetzte (auch
 *  geerbte) und schon offen vorgeschlagene Zuordnungen werden nicht erneut
 *  vorgeschlagen. */
function zuordnungsvorschlaege(db: Database, type: EntityType, item: WorkItem, ticketId?: ID): Suggestion[] {
  const text = textVon(type, item);
  if (!text) return [];
  const bestehend = new Set(effectiveAssignments(db, item.id, ticketId).map((a) => `${a.kind}|${a.valueId}`));
  const offenSchon = new Set(
    db.suggestions
      .filter((s) => s.entityId === item.id && s.state === "Offen" && s.field !== "Dublette")
      .map((s) => `${s.field}|${String(s.value)}`),
  );
  const vorschlaege: Suggestion[] = [];
  for (const kind of ZUORDNUNGSARTEN) {
    for (const wert of valuesOfGroup(db, kind)) {
      const schluessel = `${kind}|${wert.id}`;
      if (bestehend.has(schluessel) || offenSchon.has(schluessel)) continue;
      const treffer = [wert.label, ...(wert.aliases ?? [])].some((begriff) => enthaeltBegriff(text, begriff));
      if (!treffer) continue;
      vorschlaege.push({
        id: newId(),
        entityType: type,
        entityId: item.id,
        field: kind,
        value: wert.id,
        reason: `„${wert.label}“ im Titel${type === "Ticket" ? "/Auslöser" : ""} erkannt`,
        state: "Offen",
        baseRevision: item.revision,
        createdAt: nowTimestamp(),
        decidedAt: null,
      });
    }
  }
  return vorschlaege;
}

/** Dublettenverdacht: sehr aehnlicher Titel bei einem anderen offenen Vorgang
 *  derselben Art (Ticket-zu-Ticket, Aufgabe-zu-Aufgabe). */
function dublettenVorschlag(db: Database, type: EntityType, item: WorkItem): Suggestion | null {
  const text = vergleichsform(item.title);
  if (!text) return null;
  const kandidaten: WorkItem[] = type === "Ticket" ? activeTickets(db) : activeTasks(db);
  const schonOffen = new Set(
    db.suggestions
      .filter((s) => s.entityId === item.id && s.state === "Offen" && s.field === "Dublette")
      .map((s) => String(s.value)),
  );
  for (const kandidat of kandidaten) {
    if (kandidat.id === item.id || schonOffen.has(kandidat.id)) continue;
    if (!isOpen(kandidat)) continue;
    if (!aehnlicheTitel(text, vergleichsform(kandidat.title))) continue;
    return {
      id: newId(),
      entityType: type,
      entityId: item.id,
      field: "Dublette",
      value: kandidat.id,
      reason: `Ähnlicher Titel bereits offen: „${kandidat.title}“`,
      state: "Offen",
      baseRevision: item.revision,
      createdAt: nowTimestamp(),
      decidedAt: null,
    };
  }
  return null;
}

/** Ermittelt die Vorschlaege fuer einen Vorgang, speichert sie aber NICHT
 *  selbst - der Aufrufer haengt sie an db.suggestions an. Ohne Wirkung, wenn
 *  K01 aus ist. ticketId nur bei Aufgaben angeben (fuer geerbte Zuordnungen). */
export function ermittleVorschlaege(db: Database, type: EntityType, item: WorkItem, ticketId?: ID): Suggestion[] {
  if (!isRuleActive(db, "K01")) return [];
  const zuordnungen = zuordnungsvorschlaege(db, type, item, ticketId);
  const dublette = dublettenVorschlag(db, type, item);
  return dublette ? [...zuordnungen, dublette] : zuordnungen;
}

/** Ermittelt und haengt die Vorschlaege fuer einen bestehenden Vorgang neu an -
 *  fuer den Knopf "Vorschläge prüfen" (z.B. nach einer Titeländerung). */
export function vorschlaegeAktualisieren(db: Database, type: EntityType, id: ID): Database {
  const item = type === "Ticket" ? db.tickets.find((t) => t.id === id) : db.tasks.find((t) => t.id === id);
  if (!item) return db;
  const ticketId = type === "Aufgabe" ? (item as Task).ticketId : undefined;
  const neue = ermittleVorschlaege(db, type, item, ticketId);
  if (neue.length === 0) return db;
  return {
    ...db,
    suggestions: [...db.suggestions, ...neue],
    meta: { ...db.meta, dataRevision: db.meta.dataRevision + 1 },
  };
}

export function offeneVorschlaege(db: Database, entityId: ID): Suggestion[] {
  return db.suggestions.filter((s) => s.entityId === entityId && s.state === "Offen");
}

/** Bestaetigen setzt bei einem Zuordnungsvorschlag JETZT ERST die Zuordnung -
 *  nie schon beim Vorschlagen selbst (Regel K01). Ein Dublettenvorschlag hat
 *  keine Zuordnung; das Bestaetigen haelt nur fest, dass der Verdacht
 *  zutreffend zur Kenntnis genommen wurde. */
export function vorschlagBestaetigen(db: Database, suggestionId: ID): Database {
  const vorschlag = db.suggestions.find((s) => s.id === suggestionId);
  if (!vorschlag || vorschlag.state !== "Offen") return db;
  const stamp = nowTimestamp();
  let next: Database = {
    ...db,
    suggestions: db.suggestions.map((s) =>
      s.id === suggestionId ? { ...s, state: "Bestätigt" as const, decidedAt: stamp } : s,
    ),
  };
  if (vorschlag.field !== "Dublette") {
    const zuordnung = createAssignment(
      vorschlag.entityType,
      vorschlag.entityId,
      vorschlag.field as AssignmentKind,
      String(vorschlag.value),
    );
    next = { ...next, assignments: [...next.assignments, zuordnung] };
  }
  next.meta = { ...next.meta, dataRevision: next.meta.dataRevision + 1 };
  return next;
}

export function vorschlagVerwerfen(db: Database, suggestionId: ID): Database {
  const vorschlag = db.suggestions.find((s) => s.id === suggestionId);
  if (!vorschlag || vorschlag.state !== "Offen") return db;
  const stamp = nowTimestamp();
  return {
    ...db,
    suggestions: db.suggestions.map((s) =>
      s.id === suggestionId ? { ...s, state: "Verworfen" as const, decidedAt: stamp } : s,
    ),
    meta: { ...db.meta, dataRevision: db.meta.dataRevision + 1 },
  };
}
