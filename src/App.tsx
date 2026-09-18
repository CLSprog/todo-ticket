// P08 ToDo-Ticket - Zusammenfuehrung der Ansichten.
//
// Die App kennt den Speicherort nur ueber die Repository-Schnittstelle. Der
// Synchronisationszustand ist immer sichtbar (Kapitel 16); nicht gespeicherte
// Aenderungen bleiben im lokalen Arbeitscache, damit offline nichts verloren geht.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Schnellerfassung, type NeuesTicket } from "./ui/Schnellerfassung";
import { Filterleiste } from "./ui/Filterleiste";
import { Ticketdetail, type DetailAktionen } from "./ui/Ticketdetail";
import { Einstellungen } from "./ui/Einstellungen";
import { Konfliktdialog } from "./ui/Konfliktdialog";
import { Hinweise, Marke } from "./ui/Teile";

import {
  activeTasks,
  activeTickets,
  createAssignment,
  createEvent,
  createTask,
  createTicket,
  newId,
  valueLabel,
} from "./data/db";
import { addNote, completeItem, completeWithFollowUp, confirmDelegation, redelegate, reopenItem, softDelete, updateItem } from "./data/actions";
import { assistanceItems, delegationDueDate, hintsFor } from "./data/derive";
import { LEERER_FILTER, suche, type FilterState } from "./data/filter";
import { createEmptyDatabase } from "./data/db";
import { formatDate, nowTimestamp, today } from "./data/dates";
import { dateStamp, downloadBlob } from "./bausteine/B04-C07_Datei-Download";
import { makeRepository, type Repository } from "./storage/repository";
import { applyConflictResolutions, type FieldConflict } from "./storage/sync";
import { clearPending, readPending, writePending } from "./storage/syncStore";
import {
  SELF_PERSON_ID,
  type AssignmentKind,
  type Database,

  type ID,
  type Rule,
  type Task,
  type Ticket,
  type ValueItem,
  type WorkItem,
} from "./data/types";

type Ansicht = "assistenz" | "liste" | "einstellungen";
type Speicherzustand = "geladen" | "speichert" | "gespeichert" | "offline" | "fehler";

const SPEICHER_SCHLUESSEL = "p08_speicher";
const CACHE_DATEI = "arbeitsstand";

export default function App() {
  const [db, setDb] = useState<Database>(() => readPending(CACHE_DATEI) ?? createEmptyDatabase());
  const [ansicht, setAnsicht] = useState<Ansicht>("assistenz");
  const [filter, setFilter] = useState<FilterState>(LEERER_FILTER);
  const [offenesTicket, setOffenesTicket] = useState<ID | null>(null);
  const [speicherId, setSpeicherId] = useState<string>(() => localStorage.getItem(SPEICHER_SCHLUESSEL) ?? "local");
  const [zustand, setZustand] = useState<Speicherzustand>("geladen");
  const [meldung, setMeldung] = useState<string>("");
  const [konflikte, setKonflikte] = useState<{ merged: Database; conflicts: FieldConflict[] } | null>(null);
  const [angemeldet, setAngemeldet] = useState(false);
  const [importVorschau, setImportVorschau] = useState<{ db: Database; meldungen: string[] } | null>(null);

  const repo = useMemo<Repository>(() => makeRepository(speicherId), [speicherId]);
  const ersterLauf = useRef(true);
  const speicherTimer = useRef<number | undefined>(undefined);

  // Beim Start bzw. Speicherwechsel den vorhandenen Bestand laden.
  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      try {
        await repo.init();
        setAngemeldet(repo.isSignedIn());
        if (repo.needsSignIn() && !repo.isSignedIn()) {
          setMeldung("Nicht angemeldet – es wird nur der lokale Arbeitsstand angezeigt.");
          return;
        }
        const geladen = await repo.load();
        if (abgebrochen) return;
        if (geladen) {
          setDb(geladen);
          setMeldung("");
        }
        setZustand("geladen");
      } catch (error) {
        if (!abgebrochen) {
          setZustand("fehler");
          setMeldung(`Laden fehlgeschlagen: ${String(error)}. Vorhandene Daten bleiben unverändert.`);
        }
      }
    })();
    return () => {
      abgebrochen = true;
    };
  }, [repo]);

  // Jede Aenderung geht sofort in den lokalen Arbeitscache und verzoegert in
  // die eigentliche Ablage - damit ueberlebt ein Neuladen ohne Verbindung.
  useEffect(() => {
    if (ersterLauf.current) {
      ersterLauf.current = false;
      return;
    }
    writePending(CACHE_DATEI, db);
    window.clearTimeout(speicherTimer.current);
    speicherTimer.current = window.setTimeout(() => void speichern(db), 800);
    return () => window.clearTimeout(speicherTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  const speichern = useCallback(
    async (stand: Database) => {
      if (repo.needsSignIn() && !repo.isSignedIn()) return;
      setZustand("speichert");
      try {
        const ergebnis = await repo.save(stand);
        if (ergebnis.status === "gespeichert") {
          setZustand("gespeichert");
          setMeldung("");
          clearPending(CACHE_DATEI);
          if (ergebnis.db !== stand) setDb(ergebnis.db);
        } else if (ergebnis.status === "konflikt") {
          setKonflikte({ merged: ergebnis.merged, conflicts: ergebnis.conflicts });
          setZustand("fehler");
        } else {
          setZustand("offline");
          setMeldung("Offline – Änderungen sind lokal gesichert und werden nachgereicht.");
        }
      } catch (error) {
        setZustand("fehler");
        setMeldung(`Speichern fehlgeschlagen: ${String(error)}`);
      }
    },
    [repo],
  );

  // ---------------------------------------------------------------- Aktionen

  function anlegen(eingabe: NeuesTicket) {
    const ticket = createTicket(eingabe.title, {
      description: eingabe.description,
      leadId: eingabe.leadId,
      dueDate: eingabe.dueDate,
      priority: eingabe.priority,
      trigger: eingabe.trigger,
    });
    const mitFrist =
      eingabe.leadId === SELF_PERSON_ID
        ? ticket
        : {
            ...ticket,
            delegationRequiredAt: nowTimestamp(),
            delegationDueDate: delegationDueDate(db, ticket, today()),
          };

    const zuordnungen = [
      ...eingabe.projekte.map((id) => createAssignment("Ticket", ticket.id, "Projekt", id)),
      ...eingabe.abstimmungMit.map((id) => createAssignment("Ticket", ticket.id, "Abstimmung mit", id)),
    ];

    setDb((stand) => ({
      ...stand,
      tickets: [...stand.tickets, mitFrist],
      assignments: [...stand.assignments, ...zuordnungen],
      events: [...stand.events, createEvent("Ticket", ticket.id, "Erfassung", "Ticket erfasst")],
      meta: { ...stand.meta, dataRevision: stand.meta.dataRevision + 1 },
    }));
  }

  const aktionen: DetailAktionen = {
    aendern: (type, id, patch) => setDb((stand) => updateItem(stand, type, id, patch)),
    zuordnen: (type, id, kind: AssignmentKind, valueIds) =>
      setDb((stand) => {
        const stamp = nowTimestamp();
        const bestehend = stand.assignments.filter((a) => a.entityId === id && a.kind === kind && !a.deletedAt);
        const entfernt = bestehend.filter((a) => !valueIds.includes(a.valueId)).map((a) => a.id);
        const vorhandene = bestehend.map((a) => a.valueId);
        const neue = valueIds
          .filter((valueId) => !vorhandene.includes(valueId))
          .map((valueId) => createAssignment(type, id, kind, valueId));
        return {
          ...stand,
          assignments: [
            ...stand.assignments.map((a) => (entfernt.includes(a.id) ? { ...a, deletedAt: stamp } : a)),
            ...neue,
          ],
          meta: { ...stand.meta, dataRevision: stand.meta.dataRevision + 1 },
        };
      }),
    delegationBestaetigen: (type, id, empfaengerId, text) =>
      setDb((stand) => confirmDelegation(stand, type, id, empfaengerId, text)),
    erneutDelegieren: (type, id) => setDb((stand) => redelegate(stand, type, id)),
    abschliessen: (type, id, ergebnis) =>
      setDb((stand) => {
        const ergebnisse = completeItem(stand, type, id, ergebnis);
        if (ergebnisse.blockedBy) {
          setMeldung(`Abschluss gestoppt: ${ergebnisse.blockedBy.length} offene Aufgabe(n) (Regel A03).`);
          return stand;
        }
        return ergebnisse.db;
      }),
    wiederOeffnen: (type, id) => setDb((stand) => reopenItem(stand, type, id)),
    aufgabeAnlegen: (ticketId, titel) =>
      setDb((stand) => {
        const task = createTask(ticketId, titel);
        return {
          ...stand,
          tasks: [...stand.tasks, task],
          events: [...stand.events, createEvent("Aufgabe", task.id, "Erfassung", "Aufgabe erfasst")],
          meta: { ...stand.meta, dataRevision: stand.meta.dataRevision + 1 },
        };
      }),
    folgeaufgabe: (taskId, titel, ergebnis) =>
      setDb((stand) => completeWithFollowUp(stand, taskId, { title: titel }, ergebnis)),
    notiz: (type, id, text) => setDb((stand) => addNote(stand, type, id, text)),
    loeschen: (type, id) => {
      setDb((stand) => softDelete(stand, type, id));
      if (type === "Ticket") setOffenesTicket(null);
    },
  };

  // ------------------------------------------------------------- Sicherung

  function exportJson() {
    const blob = new Blob([JSON.stringify({ ...db, meta: { ...db.meta, generatedAt: nowTimestamp() } }, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, `P08_ToDo-Ticket Daten_V01-00_${dateStamp()}_AI.json`);
  }

  async function exportExcelDatei() {
    // exceljs wird erst beim tatsaechlichen Export geladen - das haelt den
    // Start am Handy klein (die Bibliothek ist der groesste Einzelposten).
    const { exportExcel } = await import("./export/excel");
    const blob = await exportExcel(db);
    downloadBlob(blob, `P08_ToDo-Ticket Snapshot_V01-00_${dateStamp()}_AI.xlsx`);
  }

  async function importDatei(datei: File) {
    try {
      if (datei.name.toLowerCase().endsWith(".json")) {
        const text = await datei.text();
        const geladen = JSON.parse(text) as Database;
        if (!geladen.tickets || !geladen.meta) throw new Error("Kein gültiger P08-Datenbestand.");
        setImportVorschau({ db: geladen, meldungen: [] });
      } else {
        const puffer = await datei.arrayBuffer();
        const { importExcel } = await import("./export/excel");
        const bericht = await importExcel(puffer, db);
        if (bericht.db) setImportVorschau({ db: bericht.db, meldungen: bericht.meldungen });
      }
    } catch (error) {
      setMeldung(`Wiederherstellung abgebrochen: ${String(error)}. Der vorhandene Stand bleibt unverändert.`);
    }
  }

  // ------------------------------------------------------------- Ansichten

  const ticket = offenesTicket ? db.tickets.find((t) => t.id === offenesTicket) : undefined;
  const treffer = useMemo(() => suche(db, filter), [db, filter]);
  const assistenz = useMemo(
    () => assistanceItems(db, activeTickets(db), activeTasks(db)).slice(0, 30),
    [db],
  );
  const projektVorschlag = filter.projekte;

  function titelVon(item: WorkItem): { titel: string; zusatz: string; ticketId: ID } {
    const alsAufgabe = db.tasks.find((t) => t.id === item.id);
    if (alsAufgabe) {
      const eltern = db.tickets.find((t) => t.id === alsAufgabe.ticketId);
      return { titel: item.title, zusatz: eltern ? `Ticket: ${eltern.title}` : "", ticketId: alsAufgabe.ticketId };
    }
    return { titel: item.title, zusatz: "", ticketId: item.id };
  }

  return (
    <div className="app">
      <header className="kopf">
        <h1>P08 ToDo-Ticket</h1>
        <div className="zeile">
          <nav className="reiter">
            <button type="button" aria-pressed={ansicht === "assistenz"} onClick={() => { setAnsicht("assistenz"); setOffenesTicket(null); }}>
              Als Nächstes
            </button>
            <button type="button" aria-pressed={ansicht === "liste"} onClick={() => { setAnsicht("liste"); setOffenesTicket(null); }}>
              Suchen
            </button>
            <button type="button" aria-pressed={ansicht === "einstellungen"} onClick={() => { setAnsicht("einstellungen"); setOffenesTicket(null); }}>
              Einstellungen
            </button>
          </nav>
        </div>
        <div className="status-zeile" style={{ marginTop: 6 }}>
          <span className={`punkt ${zustand === "gespeichert" || zustand === "geladen" ? "ok" : zustand === "fehler" ? "warn" : "aus"}`} />
          {speicherId === "onedrive" ? "OneDrive" : "Nur dieses Gerät"} ·{" "}
          {zustand === "speichert"
            ? "speichert …"
            : zustand === "gespeichert"
              ? "gespeichert"
              : zustand === "offline"
                ? "offline, lokal gesichert"
                : zustand === "fehler"
                  ? "nicht gespeichert"
                  : "geladen"}
        </div>
      </header>

      {meldung && (
        <div className={`hinweis ${zustand === "fehler" ? "dringend" : "info"}`}>
          {meldung}
          <button type="button" className="zweit" style={{ marginLeft: 8 }} onClick={() => setMeldung("")}>
            OK
          </button>
        </div>
      )}

      {ticket ? (
        <Ticketdetail db={db} ticket={ticket} aktionen={aktionen} onZurueck={() => setOffenesTicket(null)} />
      ) : ansicht === "einstellungen" ? (
        <Einstellungen
          db={db}
          speicherId={speicherId}
          angemeldet={angemeldet}
          onSpeicherWechsel={(id) => {
            localStorage.setItem(SPEICHER_SCHLUESSEL, id);
            setSpeicherId(id);
          }}
          onAnmelden={async () => {
            try {
              await repo.signIn();
              setAngemeldet(true);
              const geladen = await repo.load();
              if (geladen) setDb(geladen);
              setMeldung("");
            } catch (error) {
              setMeldung(`Anmeldung fehlgeschlagen: ${String(error)}`);
            }
          }}
          onAbmelden={async () => {
            await repo.signOut();
            setAngemeldet(false);
          }}
          onRegelAendern={(rule: Rule) =>
            setDb((stand) => ({ ...stand, rules: stand.rules.map((r) => (r.id === rule.id ? rule : r)) }))
          }
          onWertAnlegen={(gruppe, label) =>
            setDb((stand) => ({
              ...stand,
              values: [
                ...stand.values,
                {
                  id: newId(),
                  group: gruppe as ValueItem["group"],
                  label,
                  aliases: [],
                  active: true,
                  sortOrder: stand.values.filter((v) => v.group === gruppe).length,
                },
              ],
            }))
          }
          onWertAendern={(wert) =>
            setDb((stand) => ({ ...stand, values: stand.values.map((v) => (v.id === wert.id ? wert : v)) }))
          }
          onExportJson={exportJson}
          onExportExcel={() => void exportExcelDatei()}
          onImport={(datei) => void importDatei(datei)}
        />
      ) : ansicht === "assistenz" ? (
        <>
          <Schnellerfassung db={db} projektVorschlag={projektVorschlag} onAnlegen={anlegen} />
          <div className="karte">
            <h2 style={{ fontSize: 16, marginTop: 0 }}>Als Nächstes</h2>
            {assistenz.length === 0 && <div className="leer">Nichts offen.</div>}
            {assistenz.map(({ item, hints, reason }) => {
              const { titel, zusatz, ticketId } = titelVon(item);
              return (
                <div key={item.id} className="eintrag" onClick={() => setOffenesTicket(ticketId)}>
                  <div className="kopfzeile">
                    <span className="titel">{titel}</span>
                    <Marke>{valueLabel(db, item.leadId)}</Marke>
                  </div>
                  <div className="grund">
                    {reason}
                    {zusatz ? ` · ${zusatz}` : ""}
                  </div>
                  <Hinweise hints={hints} />
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <Filterleiste db={db} filter={filter} onChange={setFilter} />
          <div className="karte">
            <div className="status-zeile" style={{ marginBottom: 6 }}>
              {treffer.length} Ticket{treffer.length === 1 ? "" : "s"}
            </div>
            {treffer.length === 0 && <div className="leer">Nichts gefunden.</div>}
            {treffer.map(({ ticket: t, aufgaben, ticketPasst }) => (
              <div key={t.id} className={`eintrag${t.status === "Erledigt" ? " erledigt" : ""}`} onClick={() => setOffenesTicket(t.id)}>
                <div className="kopfzeile">
                  <span className="titel">{t.title}</span>
                  <Marke>{t.status}</Marke>
                </div>
                <div className="grund">
                  {valueLabel(db, t.leadId)}
                  {t.dueDate ? ` · Solltermin ${formatDate(t.dueDate)}` : ""}
                  {!ticketPasst ? " · Treffer in Aufgaben" : ""}
                </div>
                <Hinweise hints={hintsFor(db, t)} />
                {aufgaben.map((task: Task) => (
                  <div key={task.id} className="grund" style={{ paddingLeft: 12 }}>
                    ↳ {task.title} · {valueLabel(db, task.leadId)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {konflikte && (
        <Konfliktdialog
          conflicts={konflikte.conflicts}
          onEntscheiden={async (entscheidungen) => {
            const aufgeloest = applyConflictResolutions(konflikte.merged, konflikte.conflicts, entscheidungen);
            setKonflikte(null);
            setDb(aufgeloest);
            await repo.force(aufgeloest);
            setZustand("gespeichert");
          }}
          onAbbrechen={() => setKonflikte(null)}
        />
      )}

      {importVorschau && (
        <dialog open>
          <h2>Wiederherstellen</h2>
          <div className="hinweis warnung">
            Der aktuelle Stand wird ersetzt. {importVorschau.db.tickets.length} Tickets,{" "}
            {importVorschau.db.tasks.length} Aufgaben, {importVorschau.db.events.length} Verlaufseinträge.
          </div>
          {importVorschau.meldungen.length > 0 && (
            <ul style={{ fontSize: 14 }}>
              {importVorschau.meldungen.slice(0, 20).map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
          <div className="knopfreihe">
            <button
              type="button"
              className="haupt"
              onClick={() => {
                exportJson(); // Sicherung des bisherigen Stands vor dem Ersetzen
                setDb(importVorschau.db);
                setImportVorschau(null);
              }}
            >
              Übernehmen (bisheriger Stand wird vorher heruntergeladen)
            </button>
            <button type="button" className="zweit" onClick={() => setImportVorschau(null)}>
              Abbrechen
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}

export type { Ticket };
