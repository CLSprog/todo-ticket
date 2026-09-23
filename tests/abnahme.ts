// Abnahmetests zu Kapitel 22 und 23 des Konzepts V01-04.
//
// Geprueft wird die fachliche Logik ohne Oberflaeche. Bedienschritte, die
// zwingend einen Browser brauchen (T11 Besprechungsansicht, T15 zwei Geraete
// offline, T17 beschaedigte Datei, T20 Zustellung bei geschlossener App),
// stehen am Ende als ausdruecklich NICHT automatisch geprueft.
//
// Aufruf: npm run test

import {
  addNote,
  completeItem,
  completeWithFollowUp,
  confirmDelegation,
  redelegate,
  reopenItem,
  updateItem,
} from "../src/data/actions";
import { activeTasks, activeTickets, createAssignment, createEmptyDatabase, createTask, createTicket, tasksOfTicket } from "../src/data/db";
import { addWorkingDays } from "../src/data/dates";
import {
  assignmentValueIds,
  assistanceItems,
  delegationDueDate,
  effectiveAssignments,
  hintsFor,
  needsDelegation,
} from "../src/data/derive";
import { kontextAktiv, passtKontext, suche, LEERER_FILTER } from "../src/data/filter";
import { buildMailText } from "../src/data/mailtext";
import { buildWorkbook, importExcel } from "../src/export/excel";
import {
  ermittleVorschlaege,
  offeneVorschlaege,
  vorschlagBestaetigen,
  vorschlagVerwerfen,
  vorschlaegeAktualisieren,
} from "../src/data/suggestions";
import { sicherungsDateiname, taeglicheSicherung, type SicherungsZiel } from "../src/storage/sicherung";
import { findePerson, vergleichsform } from "../src/ui/Personenfeld";
import type { Database, Ticket } from "../src/data/types";
import { SELF_PERSON_ID } from "../src/data/types";

let bestanden = 0;
const fehler: string[] = [];

function pruefe(id: string, bedingung: boolean, beschreibung: string) {
  if (bedingung) {
    bestanden += 1;
    console.log(`  OK   ${id}  ${beschreibung}`);
  } else {
    fehler.push(`${id}: ${beschreibung}`);
    console.log(`  FEHL ${id}  ${beschreibung}`);
  }
}

function mitTicket(titel: string, overrides: Partial<Ticket> = {}): { db: Database; ticket: Ticket } {
  const db = createEmptyDatabase();
  const ticket = createTicket(titel, overrides);
  return { db: { ...db, tickets: [ticket] }, ticket };
}

const JULIAN = "PERSON_JULIAN";
function mitPersonen(db: Database): Database {
  return {
    ...db,
    values: [
      ...db.values,
      { id: JULIAN, group: "Person", label: "Julian", aliases: [], active: true, sortOrder: 1 },
    ],
  };
}

async function main() {
  console.log("\nP08 ToDo-Ticket – Abnahmetests Kapitel 22/23\n");

  // --- T01: Erfassung nur mit Titel -------------------------------------
  {
    const ticket = createTicket("Änderungsevidenzliste aktualisieren");
    pruefe("T01", ticket.id.length > 0, "Ticket erhält automatisch eine ID");
    pruefe("T01", /^\d{4}-\d{2}-\d{2}$/.test(ticket.startDate), "Startdatum wird automatisch gesetzt");
    pruefe("T01", ticket.leadId === SELF_PERSON_ID, "Lead ist CLS vorbelegt");
    pruefe("T01", ticket.priority === "Mittel", "Priorität ist Mittel vorbelegt");
    pruefe("T01", ticket.status === "Offen", "Status ist Offen");
    pruefe("T01", ticket.dueDate === null, "Kein Zwangstermin – Solltermin bleibt leer");
  }

  // --- T02: fremder Lead ------------------------------------------------
  {
    const { db, ticket } = mitTicket("Fehlende Einträge klären");
    const nachher = updateItem(mitPersonen(db), "Ticket", ticket.id, { leadId: JULIAN });
    const t = nachher.tickets[0];
    pruefe("T02", needsDelegation(t), "Fremder Lead erzeugt Delegationsbedarf");
    pruefe("T02", t.delegatedAt === null, "Keine bestätigte Übergabe allein durch Leadwechsel");
    pruefe("T02", hintsFor(nachher, t).some((h) => h.level === "dringend"), "Hinweis ist dringend");
    pruefe("T02", t.delegationDueDate !== null, "Interne Delegationsfrist wird gesetzt (D02 aktiv)");
  }

  // --- T03: Mailtext erzeugen ------------------------------------------
  {
    const { db, ticket } = mitTicket("Unterlagen anfordern");
    const mitLead = updateItem(mitPersonen(db), "Ticket", ticket.id, { leadId: JULIAN });
    const vorher = JSON.stringify(mitLead);
    const { text, luecken } = buildMailText(mitLead, "Ticket", mitLead.tickets[0]);
    pruefe("T03", JSON.stringify(mitLead) === vorher, "Texterzeugung ändert den Datenbestand nicht");
    pruefe("T03", mitLead.tickets[0].delegatedAt === null, "Kein Statuswechsel zu delegiert");
    pruefe("T03", text.includes("Julian"), "Anrede nennt den Lead");
    pruefe("T03", !/bis \d/.test(text), "Ohne Solltermin keine Fristformulierung");
    pruefe("T03", luecken.some((l) => l.includes("Solltermin")), "Fehlender Termin wird als Lücke gemeldet");
  }

  // --- T04: Delegation bestätigen --------------------------------------
  {
    const { db, ticket } = mitTicket("Liste kontrollieren", { dueDate: "2026-10-01" });
    const mitLead = updateItem(mitPersonen(db), "Ticket", ticket.id, { leadId: JULIAN });
    const nachher = confirmDelegation(mitLead, "Ticket", ticket.id, JULIAN, "Mailtext");
    const t = nachher.tickets[0];
    pruefe("T04", t.delegatedToId === JULIAN && t.delegatedAt !== null, "Delegiert an/am wird gesetzt");
    pruefe("T04", t.status === "In Bearbeitung", "Status wechselt auf In Bearbeitung");
    pruefe("T04", t.dueDate === "2026-10-01", "Solltermin bleibt unverändert");
    pruefe("T04", !needsDelegation(t), "Delegationshinweis verschwindet");
    pruefe(
      "T04",
      nachher.events.some((e) => e.kind === "Delegation" && e.details.text === "Mailtext"),
      "Bestätigter Text wird im Verlauf archiviert",
    );
  }

  // --- T05: Lead nach Delegation wechseln ------------------------------
  {
    const { db, ticket } = mitTicket("Abstimmung führen");
    const mitLead = updateItem(mitPersonen(db), "Ticket", ticket.id, { leadId: JULIAN });
    const delegiert = confirmDelegation(mitLead, "Ticket", ticket.id, JULIAN, "");
    const gewechselt = updateItem(delegiert, "Ticket", ticket.id, { leadId: "PERSON_CLS" });
    pruefe(
      "T05",
      gewechselt.events.some((e) => e.kind === "Delegation" && e.details.delegatedToId === JULIAN),
      "Bisherige Delegation bleibt im Verlauf erhalten",
    );
    pruefe("T05", gewechselt.tickets[0].delegatedAt === null, "Aktuelle Bestätigung wird geleert");
    pruefe("T05", !needsDelegation(gewechselt.tickets[0]), "Rückwechsel auf CLS erzeugt keinen neuen Bedarf");
  }

  // --- T06: Delegation ohne Solltermin ---------------------------------
  {
    const { db, ticket } = mitTicket("Rückfrage stellen");
    const mitLead = updateItem(mitPersonen(db), "Ticket", ticket.id, { leadId: JULIAN });
    const t = mitLead.tickets[0];
    pruefe("T06", t.dueDate === null, "Kein Solltermin wird erfunden");
    pruefe("T06", t.delegationDueDate !== null, "Interne Frist ist davon unabhängig sichtbar");
    const delegiert = confirmDelegation(mitLead, "Ticket", ticket.id, JULIAN, "");
    pruefe("T06", delegiert.tickets[0].status === "In Bearbeitung", "Speichern und Bestätigen bleibt möglich");
  }

  // --- T07/T09: Aufgabe erledigen, Ticket bleibt offen -----------------
  {
    const { db, ticket } = mitTicket("Evidenzliste");
    const task = createTask(ticket.id, "Fehlende Einträge klären");
    const mitAufgabe: Database = { ...db, tasks: [task] };
    const nachher = completeItem(mitAufgabe, "Aufgabe", task.id, "geklärt").db;
    pruefe("T07", nachher.tasks[0].status === "Erledigt", "Aufgabe ist erledigt");
    pruefe("T07", nachher.tickets[0].status === "Offen", "Hauptticket bleibt offen");
    pruefe("T09", nachher.tickets[0].completedAt === null, "Ticket wird nicht automatisch geschlossen");
  }

  // --- T08/T19: Erledigt + Folgeaufgabe --------------------------------
  {
    const { db, ticket } = mitTicket("Evidenzliste");
    const task = createTask(ticket.id, "Fehlende Einträge klären", { dueDate: "2026-09-20" });
    const mitAufgabe: Database = { ...mitPersonen(db), tasks: [task] };
    const delegiert = confirmDelegation(
      updateItem(mitAufgabe, "Aufgabe", task.id, { leadId: JULIAN }),
      "Aufgabe",
      task.id,
      JULIAN,
      "",
    );
    const nachher = completeWithFollowUp(delegiert, task.id, { title: "Offene Ergänzungen anfordern" }, "Teilergebnis");
    const neu = nachher.tasks.find((t) => t.id !== task.id)!;
    pruefe("T08", nachher.tasks.length === 2, "Genau eine Folgeaufgabe entsteht");
    pruefe("T08", neu.id !== task.id, "Folgeaufgabe hat eigene ID");
    pruefe("T08", neu.ticketId === ticket.id, "Gleiche Ticket-ID");
    pruefe("T08", neu.predecessorId === task.id, "Vorgänger ist verknüpft");
    pruefe("T08", neu.status === "Offen", "Folgeaufgabe startet Offen");
    pruefe("T08", neu.result === "" && neu.completedAt === null, "Ergebnis und Abschlussdatum werden nicht kopiert");
    pruefe("T08", neu.delegatedAt === null && neu.delegatedToId === null, "Delegationswerte werden nicht kopiert");
    pruefe("T08", neu.dueDate === null, "Solltermin wird neu festgelegt, nicht übernommen");
    pruefe("T08", needsDelegation(neu), "Fremder Lead löst für den neuen Schritt erneut Delegationsbedarf aus");
    pruefe("T08", nachher.tasks.find((t) => t.id === task.id)!.result === "Teilergebnis", "Altes Ergebnis bleibt erhalten");

    const nochmal = completeWithFollowUp(nachher, task.id, { title: "Doppelklick" }, "");
    pruefe("T19", nochmal.tasks.length === 2, "Ein zweiter Klick erzeugt keinen zweiten Folgeschritt");
  }

  // --- T10/T24: Personenfilter über mehrere Rollen ---------------------
  {
    const basis = mitPersonen(createEmptyDatabase());
    const ticket = createTicket("ZNA Abstimmung", { trigger: "Julian hat angerufen" });
    const task = createTask(ticket.id, "Rückmeldung einholen", { leadId: JULIAN });
    const db: Database = {
      ...basis,
      tickets: [ticket],
      tasks: [task],
      assignments: [createAssignment("Ticket", ticket.id, "Auftraggeber", JULIAN)],
    };
    const nurLead = suche(db, { ...LEERER_FILTER, person: JULIAN, personRolle: "Lead" });
    const alleRollen = suche(db, { ...LEERER_FILTER, person: JULIAN, personRolle: "Alle" });
    pruefe("T10", nurLead.length === 1 && nurLead[0].aufgaben.length === 1, "Rolle Lead findet die auszuführende Arbeit");
    pruefe("T10", nurLead[0].ticketPasst === false, "Das Ticket selbst zählt dabei nicht doppelt");
    pruefe("T10", alleRollen.length === 1, "Alle Rollen erzeugen genau einen Haupttreffer, nicht mehrere");
    pruefe("T10", alleRollen[0].ticketPasst === true, "Alle Rollen finden zusätzlich den Auftraggeber");
    pruefe(
      "T24",
      assignmentValueIds(db, ticket.id, "Auftraggeber").includes(JULIAN),
      "Strukturierte Person ist direkt filterbar",
    );
    const ohneZuordnung: Database = { ...db, assignments: [] };
    pruefe(
      "T24",
      suche(ohneZuordnung, { ...LEERER_FILTER, person: JULIAN, personRolle: "Auftraggeber" }).length === 0,
      "Nur Freitext im Auslöser erzeugt keine Personen-ID",
    );
  }

  // --- T18/T21: Wiederöffnen -------------------------------------------
  {
    const basis = mitPersonen(createEmptyDatabase());
    const ticket = createTicket("Bescheid prüfen");
    const db: Database = { ...basis, tickets: [ticket] };
    const delegiert = confirmDelegation(updateItem(db, "Ticket", ticket.id, { leadId: JULIAN }), "Ticket", ticket.id, JULIAN, "");
    const erledigt = completeItem(delegiert, "Ticket", ticket.id, "fertig").db;
    const wieder = reopenItem(erledigt, "Ticket", ticket.id, "Ergebnis unvollständig");
    const t = wieder.tickets[0];
    pruefe("T18", t.completedAt === null, "Aktueller Abschluss ist aufgehoben");
    pruefe("T18", wieder.events.some((e) => e.kind === "Abschluss"), "Abschlussgeschichte bleibt im Verlauf");
    pruefe("T21", t.status === "In Bearbeitung", "Bei gleichem fremdem Lead: In Bearbeitung");
    pruefe("T21", t.delegatedToId === JULIAN && t.delegatedAt !== null, "Bestätigte Delegation bleibt erhalten");
  }

  // --- T22: Erneut delegieren ------------------------------------------
  {
    const basis = mitPersonen(createEmptyDatabase());
    const ticket = createTicket("Nachforderung");
    const db: Database = { ...basis, tickets: [ticket] };
    const delegiert = confirmDelegation(updateItem(db, "Ticket", ticket.id, { leadId: JULIAN }), "Ticket", ticket.id, JULIAN, "");
    const erneut = redelegate(delegiert, "Ticket", ticket.id);
    const t = erneut.tickets[0];
    pruefe("T22", erneut.events.some((e) => e.details.vorherDelegatedToId === JULIAN), "Historie bleibt erhalten");
    pruefe("T22", t.delegatedAt === null, "Aktuelle Bestätigung ist geleert");
    pruefe("T22", needsDelegation(t), "Delegationsbedarf ist wieder dringend sichtbar");
    const frist = t.delegationRequiredAt;
    const nochmal = redelegate(erneut, "Ticket", ticket.id);
    pruefe("T22", nochmal.tickets[0].delegationRequiredAt === frist, "Ein erneuter Klick setzt die Frist nicht zurück");
  }

  // --- T23: effektive Zuordnungen der Aufgabe --------------------------
  {
    const basis = mitPersonen(createEmptyDatabase());
    const ticket = createTicket("LAB Koordination");
    const task = createTask(ticket.id, "Termin vereinbaren");
    const db: Database = {
      ...basis,
      tickets: [ticket],
      tasks: [task],
      assignments: [
        createAssignment("Ticket", ticket.id, "Projekt", "PROJECT_LAB"),
        createAssignment("Aufgabe", task.id, "Projekt", "PROJECT_LAB"), // bewusst doppelt
        createAssignment("Aufgabe", task.id, "Arbeitsart", "ARBEITSART_1"),
      ],
    };
    const effektiv = effectiveAssignments(db, task.id, ticket.id);
    const projekte = effektiv.filter((a) => a.kind === "Projekt");
    pruefe("T23", projekte.length === 1, "Gleicher Wert aus Ticket und Aufgabe wird dedupliziert");
    pruefe("T23", projekte[0].origin === "Aufgabe", "Die Herkunft bleibt erkennbar");
    pruefe("T23", effektiv.some((a) => a.kind === "Arbeitsart"), "Eigene Werte ergänzen den Ticketkontext");
  }

  // --- T25: D02 am Freitag ---------------------------------------------
  {
    // 2026-09-18 ist ein Freitag. Mit Kalendertag waere die Frist Samstag,
    // mit Arbeitstag erst der naechste definierte Arbeitstag (Montag).
    pruefe("T25", addWorkingDays("2026-09-18", 1) === "2026-09-21", "Ein Arbeitstag nach Freitag ist Montag");

    const basis = createEmptyDatabase();
    const ohneTermin = createTicket("Freitagsfall", { dueDate: null });
    pruefe(
      "T25",
      delegationDueDate(basis, ohneTermin, "2026-09-18") === "2026-09-21",
      "Ohne Solltermin greift die volle Arbeitstagsfrist",
    );

    const mitFruehemTermin = createTicket("Freitagsfall", { dueDate: "2026-09-19" });
    pruefe(
      "T25",
      delegationDueDate(basis, mitFruehemTermin, "2026-09-18") === "2026-09-19",
      "Ein früherer Solltermin begrenzt die Delegationsfrist",
    );

    const aus: Database = { ...basis, rules: basis.rules.map((r) => (r.id === "D02" ? { ...r, enabled: false } : r)) };
    pruefe(
      "T25",
      delegationDueDate(aus, ohneTermin, "2026-09-18") === null,
      "Deaktivierte Regel erzeugt keine Frist",
    );
  }

  // --- T16: JSON -> Excel -> JSON ---------------------------------------
  {
    const basis = mitPersonen(createEmptyDatabase());
    const ticket = createTicket("Roundtrip", { dueDate: "2026-10-05", description: "=SUMME(A1:A2) als Text" });
    const task = createTask(ticket.id, "Schritt", { predecessorId: null });
    let db: Database = {
      ...basis,
      tickets: [ticket],
      tasks: [task],
      assignments: [createAssignment("Ticket", ticket.id, "Projekt", "PROJECT_ZNA")],
      suggestions: [
        {
          id: "S1",
          entityType: "Ticket",
          entityId: ticket.id,
          field: "dueDate",
          value: "2026-10-05",
          reason: "Aus Mail",
          state: "Offen",
          baseRevision: 1,
          createdAt: new Date().toISOString(),
          decidedAt: null,
        },
      ],
    };
    db = addNote(db, "Ticket", ticket.id, "Notiz mit Umlauten: Grüße");

    const workbook = await buildWorkbook(db);
    const puffer = await workbook.xlsx.writeBuffer();
    const zurueck = await importExcel(puffer as ArrayBuffer, createEmptyDatabase());
    const neu = zurueck.db!;

    pruefe("T16", neu.tickets.length === db.tickets.length, "Alle Tickets kommen zurück");
    pruefe("T16", neu.tasks.length === db.tasks.length, "Alle Aufgaben kommen zurück");
    pruefe("T16", neu.events.length === db.events.length, "Alle Verlaufseinträge kommen zurück");
    pruefe("T16", neu.assignments.length === db.assignments.length, "Alle Zuordnungen kommen zurück");
    pruefe("T16", neu.suggestions.length === db.suggestions.length, "Vorschläge bleiben erhalten");
    pruefe("T16", neu.rules.length === db.rules.length, "Regeln bleiben erhalten");
    pruefe("T16", neu.values.length === db.values.length, "Wertelisten bleiben erhalten");
    pruefe("T16", neu.tickets[0].dueDate === "2026-10-05", "Datum bleibt als Datum erhalten");
    pruefe("T16", neu.tickets[0].description === "=SUMME(A1:A2) als Text", "Text mit Gleichheitszeichen bleibt wiederherstellbar");
    pruefe("T16", neu.tickets[0].completedAt === null, "Leere Zellen werden zu null, nicht zu 0");
    pruefe("T16", neu.tickets[0].revision === db.tickets[0].revision, "Revision bleibt erhalten");
    pruefe("T16", neu.tasks[0].ticketId === ticket.id, "Beziehung Aufgabe → Ticket bleibt erhalten");
    pruefe(
      "T16",
      JSON.stringify(neu.rules.find((r) => r.id === "D02")!.parameters) ===
        JSON.stringify(db.rules.find((r) => r.id === "D02")!.parameters),
      "Regelparameter bleiben typgetreu erhalten",
    );
    pruefe("T16", neu.events.some((e) => e.text.includes("Grüße")), "Umlaute bleiben erhalten");
    pruefe("T16", zurueck.meldungen.length === 0, "Roundtrip meldet keine Auffälligkeiten");
  }

  // --- T26: freie Namenseingabe (Arbeitspunkt 1) --------------------------
  {
    const db = mitPersonen(createEmptyDatabase());
    pruefe("T26", findePerson(db, "Julian")?.id === JULIAN, "Vorhandener Name wird gefunden");
    pruefe("T26", findePerson(db, "  julian ")?.id === JULIAN, "Groß-/Kleinschreibung und Leerzeichen spielen keine Rolle");
    pruefe("T26", findePerson(db, "Clemens")?.id === SELF_PERSON_ID, "Alias wird gefunden (Clemens → CLS)");
    pruefe("T26", findePerson(db, "Sabine") === undefined, "Unbekannter Name wird nicht gefunden");
    pruefe("T26", findePerson(db, "   ") === undefined, "Leere Eingabe erzeugt keinen Treffer");
    pruefe("T26", vergleichsform(" Anna   Maria ") === "anna maria", "Mehrfache Leerzeichen werden zusammengezogen");

    // Delegation an eine neu angelegte Person
    const neueId = "PERSON_NEU";
    const mitNeuer: Database = {
      ...db,
      values: [...db.values, { id: neueId, group: "Person", label: "Sabine", aliases: [], active: true, sortOrder: 2 }],
    };
    const ticket = createTicket("An Sabine übergeben");
    const stand: Database = { ...mitNeuer, tickets: [ticket] };
    const nachher = updateItem(stand, "Ticket", ticket.id, { leadId: neueId });
    pruefe("T26", needsDelegation(nachher.tickets[0]), "Neu angelegte Person löst Delegationsbedarf aus");
    const delegiert = confirmDelegation(nachher, "Ticket", ticket.id, neueId, "");
    pruefe("T26", delegiert.tickets[0].delegatedToId === neueId, "Delegation an die neue Person wird bestätigt");
    pruefe(
      "T26",
      suche(delegiert, { ...LEERER_FILTER, quick: "alle", person: neueId, personRolle: "Lead" }).length === 1,
      "Personenfilter findet die neue Person in der Rolle Lead",
    );
  }

  // --- T27: Datumsbereich-Filter (Paket B) --------------------------------
  {
    const db = createEmptyDatabase();
    const frueh = createTicket("Frueh faellig", { dueDate: "2026-09-10" });
    const spaet = createTicket("Spaet faellig", { dueDate: "2026-09-25" });
    const ohne = createTicket("Ohne Solltermin");
    let stand: Database = { ...db, tickets: [frueh, spaet, ohne] };

    const eingegrenzt = { ...LEERER_FILTER, quick: "alle" as const, solltermVon: "2026-09-05", solltermBis: "2026-09-15" };
    const treffer = suche(stand, eingegrenzt).map((t) => t.ticket.id);
    pruefe("T27", treffer.includes(frueh.id), "Termin innerhalb des Bereichs erscheint");
    pruefe("T27", !treffer.includes(spaet.id), "Termin außerhalb des Bereichs erscheint nicht");
    pruefe("T27", !treffer.includes(ohne.id), "Ohne Solltermin erscheint bei eingegrenztem Bereich nicht");

    const offenAlle = suche(stand, { ...LEERER_FILTER, quick: "alle" as const }).map((t) => t.ticket.id);
    pruefe("T27", offenAlle.includes(ohne.id), "Ohne Bereichsgrenzen erscheint auch der Termin ohne Solltermin");

    const erledigt = completeItem(stand, "Ticket", frueh.id, "").db;
    stand = { ...erledigt };
    const heute = stand.tickets.find((t) => t.id === frueh.id)!.completedAt!.slice(0, 10);
    const imBereich = suche(stand, { ...LEERER_FILTER, quick: "alle" as const, erledigtVon: heute, erledigtBis: heute }).map(
      (t) => t.ticket.id,
    );
    pruefe("T27", imBereich.includes(frueh.id), "Erledigungsdatum im Bereich wird gefunden");
    const ausserhalb = suche(stand, { ...LEERER_FILTER, quick: "alle" as const, erledigtVon: "2099-01-01", erledigtBis: "2099-01-31" });
    pruefe("T27", !ausserhalb.some((t) => t.ticket.id === frueh.id), "Erledigungsdatum außerhalb des Bereichs wird nicht gefunden");
  }

  // --- T28: Kontextbezug bei "Als Nächstes" (Paket B) ---------------------
  {
    const PROJEKT_X = "PROJEKT_X";
    const dbLeer = createEmptyDatabase();
    const dbMitWert: Database = {
      ...dbLeer,
      values: [...dbLeer.values, { id: PROJEKT_X, group: "Projekt", label: "Projekt X", aliases: [], active: true, sortOrder: 0 }],
    };
    const imKontext = createTicket("Ticket im Projekt X");
    const ausserhalb = createTicket("Ticket ohne Zuordnung");
    const zuordnung = createAssignment("Ticket", imKontext.id, "Projekt", PROJEKT_X);
    const stand: Database = { ...dbMitWert, tickets: [imKontext, ausserhalb], assignments: [zuordnung] };

    pruefe("T28", !kontextAktiv(LEERER_FILTER), "Ohne Auswahl ist kein Kontext aktiv");
    const filterMitKontext = { ...LEERER_FILTER, projekte: [PROJEKT_X] };
    pruefe("T28", kontextAktiv(filterMitKontext), "Gewähltes Projekt gilt als Kontext");

    const global = assistanceItems(stand, activeTickets(stand), activeTasks(stand));
    pruefe("T28", global.some((r) => r.item.id === imKontext.id) && global.some((r) => r.item.id === ausserhalb.id), "Global sind beide Tickets dabei");

    const gefiltert = global.filter((r) => passtKontext(stand, r.item, undefined, filterMitKontext));
    pruefe("T28", gefiltert.some((r) => r.item.id === imKontext.id), "Im Kontext bleibt das zugeordnete Ticket");
    pruefe("T28", !gefiltert.some((r) => r.item.id === ausserhalb.id), "Im Kontext fällt das nicht zugeordnete Ticket weg");
  }

  // --- T12: Regelbasierte Vorschläge K01 (Paket B) -------------------------
  {
    const PROJEKT_BH = "PROJEKT_BH";
    const dbLeer = createEmptyDatabase();
    const dbMitWert: Database = {
      ...dbLeer,
      values: [
        ...dbLeer.values,
        { id: PROJEKT_BH, group: "Projekt", label: "Buchhaltung", aliases: ["BH"], active: true, sortOrder: 0 },
      ],
    };

    const treffer = createTicket("Rechnung für die Buchhaltung prüfen");
    const vorschlaege = ermittleVorschlaege(dbMitWert, "Ticket", treffer);
    pruefe("T12", vorschlaege.some((v) => v.field === "Projekt" && v.value === PROJEKT_BH), "Stichwort im Titel erzeugt Zuordnungsvorschlag");

    const perAlias = createTicket("Beleg für BH ablegen");
    const vorschlaegeAlias = ermittleVorschlaege(dbMitWert, "Ticket", perAlias);
    pruefe("T12", vorschlaegeAlias.some((v) => v.field === "Projekt" && v.value === PROJEKT_BH), "Alias im Titel erzeugt ebenfalls einen Vorschlag");

    const ohneTreffer = createTicket("Wocheneinkauf erledigen");
    pruefe("T12", ermittleVorschlaege(dbMitWert, "Ticket", ohneTreffer).length === 0, "Ohne Stichworttreffer kein Vorschlag");

    // Bestaetigen setzt die Zuordnung erst jetzt, nicht schon beim Vorschlagen.
    let stand: Database = { ...dbMitWert, tickets: [treffer], suggestions: vorschlaege };
    pruefe("T12", stand.assignments.length === 0, "Vorschlagen allein setzt noch keine Zuordnung");
    const vorschlagId = offeneVorschlaege(stand, treffer.id)[0].id;
    stand = vorschlagBestaetigen(stand, vorschlagId);
    pruefe("T12", stand.assignments.some((a) => a.entityId === treffer.id && a.valueId === PROJEKT_BH), "Bestätigen setzt die Zuordnung");
    pruefe("T12", offeneVorschlaege(stand, treffer.id).length === 0, "Bestätigter Vorschlag ist nicht mehr offen");
    pruefe("T12", stand.suggestions.find((s) => s.id === vorschlagId)?.state === "Bestätigt", "Zustand steht auf Bestätigt");

    // Verwerfen setzt keine Zuordnung.
    const zweiterTreffer = createTicket("Beleg für Buchhaltung");
    const zweiteVorschlaege = ermittleVorschlaege(dbMitWert, "Ticket", zweiterTreffer);
    let standZwei: Database = { ...dbMitWert, tickets: [zweiterTreffer], suggestions: zweiteVorschlaege };
    const zweiteId = offeneVorschlaege(standZwei, zweiterTreffer.id)[0].id;
    standZwei = vorschlagVerwerfen(standZwei, zweiteId);
    pruefe("T12", standZwei.assignments.length === 0, "Verwerfen setzt keine Zuordnung");
    pruefe("T12", standZwei.suggestions.find((s) => s.id === zweiteId)?.state === "Verworfen", "Zustand steht auf Verworfen");

    // Dublettenverdacht bei sehr aehnlichem, bereits offenem Titel.
    const original = createTicket("Jahresabschluss 2026 vorbereiten");
    const dublette = createTicket("Jahresabschluss 2026 vorbereiten und prüfen");
    const dbDublette: Database = { ...dbLeer, tickets: [original, dublette] };
    const dublettenVorschlaege = ermittleVorschlaege(dbDublette, "Ticket", dublette);
    pruefe("T12", dublettenVorschlaege.some((v) => v.field === "Dublette" && v.value === original.id), "Sehr ähnlicher Titel löst Dublettenverdacht aus");

    // K01 aus: keine Vorschlaege.
    const dbK01Aus: Database = { ...dbMitWert, rules: dbMitWert.rules.map((r) => (r.id === "K01" ? { ...r, enabled: false } : r)) };
    pruefe("T12", ermittleVorschlaege(dbK01Aus, "Ticket", treffer).length === 0, "Bei ausgeschalteter Regel K01 gibt es keine Vorschläge");

    // "Vorschläge prüfen" ermittelt bei geändertem Titel erneut.
    const neuTitel: Database = {
      ...dbMitWert,
      tickets: [{ ...ohneTreffer, title: "Rechnung an Buchhaltung weiterleiten" }],
    };
    const aktualisiert = vorschlaegeAktualisieren(neuTitel, "Ticket", ohneTreffer.id);
    pruefe("T12", offeneVorschlaege(aktualisiert, ohneTreffer.id).some((v) => v.value === PROJEKT_BH), "„Vorschläge prüfen” findet nach Titeländerung einen neuen Vorschlag");
  }

  // --- T29: Automatische tägliche Sicherung (Paket C) ---------------------
  {
    function fakeZiel(vorhandeneDateien: string[]): { ziel: SicherungsZiel; gesichert: string[]; angefragteOrdner: string[] } {
      const gesichert: string[] = [];
      const angefragteOrdner: string[] = [];
      const ziel: SicherungsZiel = {
        async listFiles(folder) {
          angefragteOrdner.push(folder);
          return vorhandeneDateien;
        },
        async saveBackup(_state, stamp) {
          gesichert.push(stamp);
        },
      };
      return { ziel, gesichert, angefragteOrdner };
    }

    const heute = new Date("2026-09-22T09:00:00");
    pruefe("T29", sicherungsDateiname("20260922") === "P08_ToDo-Ticket_Daten_20260922_AI.json", "Dateiname folgt dem Muster von onedrive.saveBackup");

    const { ziel: zielLeer, gesichert: gesichertLeer, angefragteOrdner } = fakeZiel([]);
    const wurdeGesichert = await taeglicheSicherung(zielLeer, "07_Database", { w: 1 }, heute);
    pruefe("T29", wurdeGesichert === true, "Erster Speichervorgang des Tages sichert");
    pruefe("T29", gesichertLeer.length === 1 && gesichertLeer[0] === "20260922", "Sicherung trägt den Tagesstempel");
    pruefe("T29", angefragteOrdner[0] === "07_Database/Sicherung", "Der Sicherungsordner liegt unter dem Datenordner");

    const { ziel: zielVorhanden, gesichert: gesichertZwei } = fakeZiel(["P08_ToDo-Ticket_Daten_20260922_AI.json"]);
    const zweiterVersuch = await taeglicheSicherung(zielVorhanden, "07_Database", { w: 2 }, heute);
    pruefe("T29", zweiterVersuch === false, "Ein zweiter Speichervorgang am selben Tag sichert nicht erneut");
    pruefe("T29", gesichertZwei.length === 0, "Kein zweiter Sicherungsaufruf am selben Tag");

    // Zwei Geraete am selben Tag: das zweite sieht die Datei des ersten im
    // gemeinsamen Ordner und sichert deshalb ebenfalls nicht doppelt.
    const { ziel: zielAnderesGeraet } = fakeZiel(["P08_ToDo-Ticket_Daten_20260922_AI.json"]);
    const zweitesGeraet = await taeglicheSicherung(zielAnderesGeraet, "07_Database", { w: 3 }, heute);
    pruefe("T29", zweitesGeraet === false, "Ein zweites Gerät sieht die Sicherung des ersten und sichert nicht doppelt");

    const morgen = new Date("2026-09-23T08:00:00");
    const { ziel: zielMorgen, gesichert: gesichertMorgen } = fakeZiel(["P08_ToDo-Ticket_Daten_20260922_AI.json"]);
    const naechsterTag = await taeglicheSicherung(zielMorgen, "07_Database", { w: 4 }, morgen);
    pruefe("T29", naechsterTag === true, "Am nächsten Tag wird wieder gesichert");
    pruefe("T29", gesichertMorgen[0] === "20260923", "Die neue Sicherung trägt den neuen Tagesstempel");

    const fehlerZiel: SicherungsZiel = {
      async listFiles() {
        throw new Error("Netzwerkfehler");
      },
      async saveBackup() {},
    };
    let keinAbsturz = true;
    try {
      const ergebnis = await taeglicheSicherung(fehlerZiel, "07_Database", { w: 5 }, heute);
      pruefe("T29", ergebnis === false, "Ein Fehler bei der Sicherung liefert false, statt zu werfen");
    } catch {
      keinAbsturz = false;
    }
    pruefe("T29", keinAbsturz, "Ein Sicherungsfehler wirft nicht bis zum Speichervorgang durch");
  }

  // --- T30: Excel-Export mit Autofilter (Paket C) --------------------------
  {
    const ticket = createTicket("Für Excel-Export");
    const db: Database = { ...createEmptyDatabase(), tickets: [ticket] };
    const workbook = await buildWorkbook(db);
    const sheet = workbook.getWorksheet("Tickets")!;
    pruefe("T30", sheet.views?.[0]?.state === "frozen", "Kopfzeile bleibt beim Scrollen stehen");
    pruefe("T30", !!sheet.autoFilter, "Blatt hat einen Autofilter");
    const filter = sheet.autoFilter as { from: { row: number; column: number }; to: { row: number; column: number } };
    pruefe("T30", filter.from.row === 1 && filter.to.row === 1, "Autofilter sitzt auf der Kopfzeile");
    pruefe("T30", filter.to.column === sheet.columnCount, "Autofilter deckt alle Spalten ab");
  }

  // --- Ergebnis ---------------------------------------------------------
  console.log("\nNicht automatisch geprüft – brauchen Gerät bzw. Bedienung:");
  for (const offen of [
    "T11 Besprechung und Telefonrunde (Bedienung der Filteransicht)",
    "T13/T14 Erinnerungen und Terminwechsel (Ausgabe-Kanal ist offen, O-06)",
    "T15 Offline auf zwei Geräten (braucht zwei echte Geräte gegen OneDrive)",
    "T17 Beschädigte Datei (Fehlerpfad der OneDrive-Anbindung)",
    "T20 App geschlossen bei Fälligkeit (Zustellung ist bewusst nicht behauptet)",
  ]) {
    console.log(`  offen  ${offen}`);
  }

  console.log(`\n${bestanden} Prüfungen bestanden, ${fehler.length} fehlgeschlagen.`);
  if (fehler.length > 0) {
    for (const f of fehler) console.log(`  ! ${f}`);
    process.exit(1);
  }
}

void main();
