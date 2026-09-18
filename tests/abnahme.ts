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
import { createAssignment, createEmptyDatabase, createTask, createTicket, tasksOfTicket } from "../src/data/db";
import { addWorkingDays } from "../src/data/dates";
import { assignmentValueIds, delegationDueDate, effectiveAssignments, hintsFor, needsDelegation } from "../src/data/derive";
import { suche, LEERER_FILTER } from "../src/data/filter";
import { buildMailText } from "../src/data/mailtext";
import { buildWorkbook, importExcel } from "../src/export/excel";
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

  // --- Ergebnis ---------------------------------------------------------
  console.log("\nNicht automatisch geprüft – brauchen Gerät bzw. Bedienung:");
  for (const offen of [
    "T11 Besprechung und Telefonrunde (Bedienung der Filteransicht)",
    "T12 KI-Vorschlag ablehnen (Vorschlagsoberfläche ist im Startumfang nicht enthalten)",
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
