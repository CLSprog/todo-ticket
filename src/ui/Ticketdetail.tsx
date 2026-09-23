// Ticketdetail mit Aufgaben, Delegation, Abschluss und Verlauf.
//
// Kapitel 5: Die Anzahl gespeicherter Spalten ist ausdruecklich nicht die
// Anzahl auszufuellender Formularfelder - alles ausser Titel, Lead, Termin,
// Priorität und Status liegt hinter "Weitere Angaben".

import { useState } from "react";
import { Feld, Hinweise, Marke, Mehrfachauswahl } from "./Teile";
import { Personenfeld, Personenmehrfachfeld } from "./Personenfeld";
import { Delegationsdialog, Nachfragedialog } from "./Delegation";
import { effectiveAssignments, hintsFor, isOpen, needsDelegation } from "../data/derive";
import { assignmentsOf, eventsOf, referencesOf, tasksOfTicket, valueLabel, valuesOfGroup } from "../data/db";
import { offeneVorschlaege } from "../data/suggestions";
import { formatDate, formatTimestamp } from "../data/dates";
import {
  ASSIGNMENT_KINDS,
  SELF_PERSON_ID,
  type AssignmentKind,
  type Database,
  type EntityType,
  type ID,
  type Priority,
  type Status,
  type Task,
  type Ticket,
  type WorkItem,
} from "../data/types";

export interface DetailAktionen {
  aendern: (type: EntityType, id: ID, patch: Partial<WorkItem & Ticket & Task>) => void;
  zuordnen: (type: EntityType, id: ID, kind: AssignmentKind, valueIds: ID[]) => void;
  delegationBestaetigen: (type: EntityType, id: ID, empfaengerId: ID, text: string) => void;
  erneutDelegieren: (type: EntityType, id: ID) => void;
  nachfrage: (type: EntityType, id: ID, text: string) => void;
  abschliessen: (type: EntityType, id: ID, ergebnis: string) => void;
  wiederOeffnen: (type: EntityType, id: ID, grund: string) => void;
  aufgabeAnlegen: (ticketId: ID, titel: string) => void;
  folgeaufgabe: (taskId: ID, titel: string, ergebnis: string) => void;
  notiz: (type: EntityType, id: ID, text: string) => void;
  loeschen: (type: EntityType, id: ID) => void;
  referenzAnlegen: (type: EntityType, id: ID, label: string, uri: string) => void;
  referenzEntfernen: (referenceId: ID) => void;
  vorschlagBestaetigen: (suggestionId: ID) => void;
  vorschlagVerwerfen: (suggestionId: ID) => void;
  vorschlaegeAktualisieren: (type: EntityType, id: ID) => void;
  /** Legt eine neue Person an und liefert deren ID sofort zurueck. */
  personAnlegen: (label: string) => ID;
}

function Kopfdaten({
  db,
  type,
  item,
  aktionen,
}: {
  db: Database;
  type: EntityType;
  item: WorkItem;
  aktionen: DetailAktionen;
}) {
  return (
    <div className="feldgitter">
      <Feld label="Lead">
        <Personenfeld
          db={db}
          wert={item.leadId}
          onChange={(id) => aktionen.aendern(type, item.id, { leadId: id ?? SELF_PERSON_ID })}
          aktionen={{ anlegen: aktionen.personAnlegen }}
          listenId={`personen-lead-${item.id}`}
          pflicht
        />
      </Feld>
      <Feld label="Solltermin">
        <input
          type="date"
          value={item.dueDate ?? ""}
          onChange={(event) => aktionen.aendern(type, item.id, { dueDate: event.target.value || null })}
        />
      </Feld>
      <Feld label="Priorität">
        <select
          value={item.priority}
          onChange={(event) => aktionen.aendern(type, item.id, { priority: event.target.value as Priority })}
        >
          <option>Hoch</option>
          <option>Mittel</option>
          <option>Niedrig</option>
        </select>
      </Feld>
      <Feld label="Status">
        <select
          value={item.status}
          onChange={(event) => {
            const status = event.target.value as Status;
            if (status === "Erledigt") aktionen.abschliessen(type, item.id, "");
            else if (item.status === "Erledigt") aktionen.wiederOeffnen(type, item.id, "");
            else aktionen.aendern(type, item.id, { status });
          }}
        >
          <option>Offen</option>
          <option>In Bearbeitung</option>
          <option>Erledigt</option>
        </select>
      </Feld>
    </div>
  );
}

function Zuordnungen({
  db,
  type,
  item,
  ticketId,
  aktionen,
}: {
  db: Database;
  type: EntityType;
  item: WorkItem;
  ticketId?: ID;
  aktionen: DetailAktionen;
}) {
  const gruppeZuArt: Record<AssignmentKind, string> = {
    Projekt: "Projekt",
    Thema: "Thema",
    Besprechungskreis: "Besprechungskreis",
    Arbeitsart: "Arbeitsart",
    "Abstimmung mit": "Person",
    Auftraggeber: "Person",
    "Rückmeldung an": "Person",
  };
  const eigene = assignmentsOf(db, item.id);
  const effektiv = effectiveAssignments(db, item.id, ticketId);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {ASSIGNMENT_KINDS.map((kind) => {
        const geerbt = effektiv.filter((a) => a.kind === kind && a.origin === "Ticket");
        const gewaehlt = eigene.filter((a) => a.kind === kind).map((a) => a.valueId);
        const istPersonenart = gruppeZuArt[kind] === "Person";
        return (
          <Feld key={kind} label={kind}>
            {istPersonenart ? (
              <Personenmehrfachfeld
                db={db}
                werte={gewaehlt}
                onChange={(ids) => aktionen.zuordnen(type, item.id, kind, ids)}
                aktionen={{ anlegen: aktionen.personAnlegen }}
                listenId={`personen-${kind.replace(/\s+/g, "-")}-${item.id}`}
              />
            ) : (
              <Mehrfachauswahl
                optionen={valuesOfGroup(db, gruppeZuArt[kind]).map((v) => ({ id: v.id, label: v.label }))}
                gewaehlt={gewaehlt}
                onChange={(ids) => aktionen.zuordnen(type, item.id, kind, ids)}
              />
            )}
            {type === "Aufgabe" && geerbt.length > 0 && (
              <div className="marken">
                {geerbt.map((a) => (
                  <Marke key={a.valueId} art="geerbt">
                    {valueLabel(db, a.valueId)} (vom Ticket)
                  </Marke>
                ))}
              </div>
            )}
          </Feld>
        );
      })}
    </div>
  );
}

function Verlauf({ db, id }: { db: Database; id: ID }) {
  const events = eventsOf(db, id);
  if (events.length === 0) return <div className="leer">Noch kein Verlauf.</div>;
  return (
    <ul className="verlauf">
      {events.map((event) => (
        <li key={event.id}>
          <div className="zeit">
            {formatTimestamp(event.at)} · {event.kind}
          </div>
          {event.text}
        </li>
      ))}
    </ul>
  );
}

/** Quellen und Links (Paket A). Nur Verweise - keine Dateiuebernahme, siehe
 *  P08_Umsetzungsvorschlag-A-D V01-00. */
function Referenzen({
  db,
  type,
  id,
  aktionen,
}: {
  db: Database;
  type: EntityType;
  id: ID;
  aktionen: DetailAktionen;
}) {
  const [label, setLabel] = useState("");
  const [uri, setUri] = useState("");
  const referenzen = referencesOf(db, id);

  function anlegen() {
    if (!label.trim() && !uri.trim()) return;
    aktionen.referenzAnlegen(type, id, label, uri);
    setLabel("");
    setUri("");
  }

  return (
    <div>
      {referenzen.length === 0 && <div className="status-zeile">Keine Quellen oder Links hinterlegt.</div>}
      {referenzen.length > 0 && (
        <ul className="verlauf">
          {referenzen.map((ref) => (
            <li key={ref.id}>
              {ref.uri ? (
                <a href={ref.uri} target="_blank" rel="noreferrer">
                  {ref.label || ref.uri}
                </a>
              ) : (
                <span>{ref.label}</span>
              )}{" "}
              <button
                type="button"
                className="zweit"
                style={{ padding: "2px 8px", fontSize: 12 }}
                onClick={() => aktionen.referenzEntfernen(ref.id)}
              >
                entfernen
              </button>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Bezeichnung"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          style={{ flex: 1, minWidth: 140, padding: 8, borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--text)", font: "inherit" }}
        />
        <input
          type="text"
          placeholder="Link oder Ablageort"
          value={uri}
          onChange={(event) => setUri(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") anlegen();
          }}
          style={{ flex: 2, minWidth: 180, padding: 8, borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--text)", font: "inherit" }}
        />
        <button type="button" className="zweit" disabled={!label.trim() && !uri.trim()} onClick={anlegen}>
          Hinzufügen
        </button>
      </div>
      <div className="status-zeile" style={{ marginTop: 6 }}>
        Nur ein Verweis – Dateien werden nicht in die App übernommen.
      </div>
    </div>
  );
}

/** K01: Regelbasierte Vorschlaege (Paket B) - Zuordnung per Stichwortabgleich
 *  und Dublettenverdacht. Die Zuordnung wird erst beim Bestaetigen gesetzt,
 *  nie automatisch (Regel K01: "bestätigen, ändern, verwerfen oder ignorieren"). */
function Vorschlagsliste({
  db,
  type,
  id,
  aktionen,
}: {
  db: Database;
  type: EntityType;
  id: ID;
  aktionen: DetailAktionen;
}) {
  const vorschlaege = offeneVorschlaege(db, id);
  return (
    <div>
      {vorschlaege.length === 0 && <div className="status-zeile">Keine offenen Vorschläge.</div>}
      {vorschlaege.length > 0 && (
        <ul className="verlauf">
          {vorschlaege.map((v) => (
            <li key={v.id}>
              {v.field === "Dublette" ? "Mögliche Dublette – " : `Zuordnung „${v.field}“ – `}
              {v.reason}
              <div className="knopfreihe" style={{ marginTop: 4 }}>
                <button
                  type="button"
                  className="zweit"
                  style={{ padding: "2px 8px", fontSize: 12 }}
                  onClick={() => aktionen.vorschlagBestaetigen(v.id)}
                >
                  Bestätigen
                </button>
                <button
                  type="button"
                  className="zweit"
                  style={{ padding: "2px 8px", fontSize: 12 }}
                  onClick={() => aktionen.vorschlagVerwerfen(v.id)}
                >
                  Verwerfen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="zweit" style={{ marginTop: 8 }} onClick={() => aktionen.vorschlaegeAktualisieren(type, id)}>
        Vorschläge prüfen
      </button>
    </div>
  );
}

function Aufgabenblock({
  db,
  ticket,
  aktionen,
  onDelegieren,
}: {
  db: Database;
  ticket: Ticket;
  aktionen: DetailAktionen;
  onDelegieren: (type: EntityType, item: WorkItem) => void;
}) {
  const aufgaben = tasksOfTicket(db, ticket.id);
  const [neu, setNeu] = useState("");
  const [folgeVon, setFolgeVon] = useState<ID | null>(null);
  const [folgeTitel, setFolgeTitel] = useState("");
  const [folgeErgebnis, setFolgeErgebnis] = useState("");
  const [offeneAufgabe, setOffeneAufgabe] = useState<ID | null>(null);
  const [wiederOeffnenGrund, setWiederOeffnenGrund] = useState("");
  const [nachfrageFuer, setNachfrageFuer] = useState<Task | null>(null);

  return (
    <div>
      <div className="titelzeile" style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          placeholder="Arbeitsschritt ergänzen"
          value={neu}
          onChange={(event) => setNeu(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && neu.trim()) {
              aktionen.aufgabeAnlegen(ticket.id, neu);
              setNeu("");
            }
          }}
          style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--text)", font: "inherit" }}
        />
        <button
          type="button"
          className="zweit"
          disabled={!neu.trim()}
          onClick={() => {
            aktionen.aufgabeAnlegen(ticket.id, neu);
            setNeu("");
          }}
        >
          Hinzufügen
        </button>
      </div>

      {aufgaben.length === 0 && (
        <div className="status-zeile" style={{ marginTop: 8 }}>
          Keine Aufgaben – für eine Zwei-Minuten-Erledigung ist auch keine nötig.
        </div>
      )}

      {aufgaben.map((task) => {
        const vorgaenger = task.predecessorId ? aufgaben.find((t) => t.id === task.predecessorId) : undefined;
        return (
          <div key={task.id} className={`eintrag${task.status === "Erledigt" ? " erledigt" : ""}`}>
            <div className="kopfzeile" onClick={() => setOffeneAufgabe(offeneAufgabe === task.id ? null : task.id)}>
              <span className="titel">{task.title}</span>
              <Marke>{task.status}</Marke>
            </div>
            <div className="grund">
              {valueLabel(db, task.leadId)}
              {task.dueDate ? ` · Solltermin ${formatDate(task.dueDate)}` : ""}
              {vorgaenger ? ` · folgt auf „${vorgaenger.title}“` : ""}
            </div>
            <Hinweise hints={hintsFor(db, task)} />

            {offeneAufgabe === task.id && (
              <div style={{ marginTop: 8 }}>
                <Kopfdaten db={db} type="Aufgabe" item={task} aktionen={aktionen} />
                <div style={{ marginTop: 8 }}>
                  <Feld label="Beschreibung">
                    <textarea
                      defaultValue={task.description}
                      onBlur={(event) => aktionen.aendern("Aufgabe", task.id, { description: event.target.value })}
                    />
                  </Feld>
                </div>
                <details className="mehr">
                  <summary>Zuordnungen der Aufgabe</summary>
                  <Zuordnungen db={db} type="Aufgabe" item={task} ticketId={ticket.id} aktionen={aktionen} />
                </details>
                <details className="mehr">
                  <summary>Quellen und Links</summary>
                  <Referenzen db={db} type="Aufgabe" id={task.id} aktionen={aktionen} />
                </details>
                <details className="mehr">
                  <summary>
                    Vorschläge
                    {offeneVorschlaege(db, task.id).length > 0 ? ` (${offeneVorschlaege(db, task.id).length})` : ""}
                  </summary>
                  <Vorschlagsliste db={db} type="Aufgabe" id={task.id} aktionen={aktionen} />
                </details>
                <details className="mehr">
                  <summary>Verlauf</summary>
                  <Verlauf db={db} id={task.id} />
                </details>

                <div className="knopfreihe">
                  {needsDelegation(task) && (
                    <button type="button" className="haupt" onClick={() => onDelegieren("Aufgabe", task)}>
                      Weitergeben
                    </button>
                  )}
                  {task.delegatedAt && isOpen(task) && (
                    <button type="button" className="zweit" onClick={() => aktionen.erneutDelegieren("Aufgabe", task.id)}>
                      Erneut delegieren
                    </button>
                  )}
                  {task.delegatedAt && isOpen(task) && (
                    <button type="button" className="zweit" onClick={() => setNachfrageFuer(task)}>
                      Nachfragen
                    </button>
                  )}
                  {isOpen(task) && (
                    <>
                      <button type="button" className="zweit" onClick={() => aktionen.abschliessen("Aufgabe", task.id, "")}>
                        Schritt erledigt
                      </button>
                      <button
                        type="button"
                        className="zweit"
                        onClick={() => {
                          setFolgeVon(task.id);
                          setFolgeTitel(task.title);
                          setFolgeErgebnis("");
                        }}
                      >
                        Erledigt + Folgeaufgabe
                      </button>
                    </>
                  )}
                  {task.status === "Erledigt" && (
                    <button
                      type="button"
                      className="zweit"
                      onClick={() => {
                        aktionen.wiederOeffnen("Aufgabe", task.id, wiederOeffnenGrund);
                        setWiederOeffnenGrund("");
                      }}
                    >
                      Wieder öffnen
                    </button>
                  )}
                  <button type="button" className="zweit gefahr" onClick={() => aktionen.loeschen("Aufgabe", task.id)}>
                    Löschen
                  </button>
                </div>

                {task.status === "Erledigt" && (
                  <Feld label="Grund der Wiederöffnung (optional)">
                    <textarea
                      value={wiederOeffnenGrund}
                      onChange={(event) => setWiederOeffnenGrund(event.target.value)}
                    />
                  </Feld>
                )}

                {folgeVon === task.id && (
                  <div className="karte" style={{ background: "var(--bg)" }}>
                    <Feld label="Ergebnis des abgeschlossenen Schritts">
                      <textarea value={folgeErgebnis} onChange={(event) => setFolgeErgebnis(event.target.value)} />
                    </Feld>
                    <Feld label="Neuer Arbeitsauftrag">
                      <input type="text" value={folgeTitel} onChange={(event) => setFolgeTitel(event.target.value)} />
                    </Feld>
                    <div className="status-zeile" style={{ marginTop: 6 }}>
                      Vorschlag aus dem Vorgänger. Ergebnis, Abschlussdatum und Delegation werden nicht übernommen;
                      der Solltermin wird neu festgelegt.
                    </div>
                    <div className="knopfreihe">
                      <button
                        type="button"
                        className="haupt"
                        disabled={!folgeTitel.trim()}
                        onClick={() => {
                          aktionen.folgeaufgabe(task.id, folgeTitel, folgeErgebnis);
                          setFolgeVon(null);
                        }}
                      >
                        Abschließen und Folgeaufgabe anlegen
                      </button>
                      <button type="button" className="zweit" onClick={() => setFolgeVon(null)}>
                        Abbrechen
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {nachfrageFuer && (
        <Nachfragedialog
          db={db}
          type="Aufgabe"
          item={nachfrageFuer}
          ticketTitle={ticket.title}
          onVermerken={(text) => aktionen.nachfrage("Aufgabe", nachfrageFuer.id, text)}
          onSchliessen={() => setNachfrageFuer(null)}
        />
      )}
    </div>
  );
}

export function Ticketdetail({
  db,
  ticket,
  aktionen,
  onZurueck,
}: {
  db: Database;
  ticket: Ticket;
  aktionen: DetailAktionen;
  onZurueck: () => void;
}) {
  const [delegation, setDelegation] = useState<{ type: EntityType; item: WorkItem } | null>(null);
  const [nachfrage, setNachfrage] = useState(false);
  const [notiz, setNotiz] = useState("");
  const [abschlussErgebnis, setAbschlussErgebnis] = useState("");
  const [wiederOeffnenGrund, setWiederOeffnenGrund] = useState("");
  const offeneAufgaben = tasksOfTicket(db, ticket.id).filter((task) => task.status !== "Erledigt");
  const alleErledigt = tasksOfTicket(db, ticket.id).length > 0 && offeneAufgaben.length === 0;

  return (
    <div>
      <div className="knopfreihe">
        <button type="button" className="zweit" onClick={onZurueck}>
          ← Zurück
        </button>
      </div>

      <div className="karte">
        <input
          type="text"
          defaultValue={ticket.title}
          aria-label="Titel"
          onBlur={(event) => aktionen.aendern("Ticket", ticket.id, { title: event.target.value })}
          style={{ width: "100%", fontSize: 18, fontWeight: 700, padding: 8, border: "1px solid transparent", borderRadius: 8, background: "transparent", color: "var(--text)", font: "inherit" }}
        />
        <Hinweise hints={hintsFor(db, ticket)} />
        <div style={{ marginTop: 10 }}>
          <Kopfdaten db={db} type="Ticket" item={ticket} aktionen={aktionen} />
        </div>

        <details className="mehr">
          <summary>Weitere Angaben</summary>
          <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
            <Feld label="Beschreibung">
              <textarea
                defaultValue={ticket.description}
                onBlur={(event) => aktionen.aendern("Ticket", ticket.id, { description: event.target.value })}
              />
            </Feld>
            <Feld label="Auslöser / Auftraggeber (Freitext)">
              <input
                type="text"
                defaultValue={ticket.trigger}
                onBlur={(event) => aktionen.aendern("Ticket", ticket.id, { trigger: event.target.value })}
              />
            </Feld>
            <div className="status-zeile">
              Freitext erzeugt keine Person. Eine bekannte Person zusätzlich unter „Auftraggeber“ zuordnen, damit sie
              filterbar ist.
            </div>
            <Feld label="Aktueller Stand">
              <textarea
                defaultValue={ticket.currentState}
                onBlur={(event) => aktionen.aendern("Ticket", ticket.id, { currentState: event.target.value })}
              />
            </Feld>
          </div>
        </details>

        <details className="mehr">
          <summary>Zuordnungen</summary>
          <Zuordnungen db={db} type="Ticket" item={ticket} aktionen={aktionen} />
        </details>

        <details className="mehr">
          <summary>Quellen und Links</summary>
          <Referenzen db={db} type="Ticket" id={ticket.id} aktionen={aktionen} />
        </details>

        <details className="mehr">
          <summary>
            Vorschläge
            {offeneVorschlaege(db, ticket.id).length > 0 ? ` (${offeneVorschlaege(db, ticket.id).length})` : ""}
          </summary>
          <Vorschlagsliste db={db} type="Ticket" id={ticket.id} aktionen={aktionen} />
        </details>

        <div className="knopfreihe">
          {needsDelegation(ticket) && (
            <button type="button" className="haupt" onClick={() => setDelegation({ type: "Ticket", item: ticket })}>
              Weitergeben
            </button>
          )}
          {ticket.delegatedAt && isOpen(ticket) && (
            <button type="button" className="zweit" onClick={() => aktionen.erneutDelegieren("Ticket", ticket.id)}>
              Erneut delegieren
            </button>
          )}
          {ticket.delegatedAt && isOpen(ticket) && (
            <button type="button" className="zweit" onClick={() => setNachfrage(true)}>
              Nachfragen
            </button>
          )}
          {ticket.status === "Erledigt" ? (
            <button
              type="button"
              className="zweit"
              onClick={() => {
                aktionen.wiederOeffnen("Ticket", ticket.id, wiederOeffnenGrund);
                setWiederOeffnenGrund("");
              }}
            >
              Ticket wieder öffnen
            </button>
          ) : (
            <button type="button" className="zweit" onClick={() => aktionen.abschliessen("Ticket", ticket.id, abschlussErgebnis)}>
              Ticket abschließen
            </button>
          )}
          <button type="button" className="zweit gefahr" onClick={() => aktionen.loeschen("Ticket", ticket.id)}>
            Löschen
          </button>
        </div>

        {ticket.delegatedAt && (
          <div className="status-zeile" style={{ marginTop: 8 }}>
            Delegiert an {valueLabel(db, ticket.delegatedToId)} am {formatTimestamp(ticket.delegatedAt)}
          </div>
        )}
        {offeneAufgaben.length > 0 && ticket.status !== "Erledigt" && (
          <div className="hinweis warnung">
            {offeneAufgaben.length} offene Aufgabe{offeneAufgaben.length === 1 ? "" : "n"} – der Ticketabschluss wird
            dadurch nicht automatisch verhindert (Regel A03 ist aus).
          </div>
        )}
        {alleErledigt && ticket.status !== "Erledigt" && (
          <div className="hinweis info">
            Alle Aufgaben erledigt. Das Ticket bleibt offen – abschließen oder eine weitere Aufgabe hinzufügen.
          </div>
        )}
        {ticket.status !== "Erledigt" && (
          <Feld label="Ergebnis beim Abschluss (optional)">
            <textarea value={abschlussErgebnis} onChange={(event) => setAbschlussErgebnis(event.target.value)} />
          </Feld>
        )}
        {ticket.status === "Erledigt" && (
          <Feld label="Grund der Wiederöffnung (optional)">
            <textarea value={wiederOeffnenGrund} onChange={(event) => setWiederOeffnenGrund(event.target.value)} />
          </Feld>
        )}
      </div>

      <div className="karte">
        <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>Aufgaben</h2>
        <Aufgabenblock db={db} ticket={ticket} aktionen={aktionen} onDelegieren={(type, item) => setDelegation({ type, item })} />
      </div>

      <div className="karte">
        <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>Verlauf</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="Notiz, Rückmeldung oder Entscheidung"
            value={notiz}
            onChange={(event) => setNotiz(event.target.value)}
            style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--text)", font: "inherit" }}
          />
          <button
            type="button"
            className="zweit"
            disabled={!notiz.trim()}
            onClick={() => {
              aktionen.notiz("Ticket", ticket.id, notiz);
              setNotiz("");
            }}
          >
            Eintragen
          </button>
        </div>
        <Verlauf db={db} id={ticket.id} />
      </div>

      {delegation && (
        <Delegationsdialog
          db={db}
          type={delegation.type}
          item={delegation.item}
          ticketTitle={delegation.type === "Aufgabe" ? ticket.title : undefined}
          onBestaetigen={(empfaengerId, text) =>
            aktionen.delegationBestaetigen(delegation.type, delegation.item.id, empfaengerId, text)
          }
          onSchliessen={() => setDelegation(null)}
          onPersonAnlegen={aktionen.personAnlegen}
        />
      )}

      {nachfrage && (
        <Nachfragedialog
          db={db}
          type="Ticket"
          item={ticket}
          onVermerken={(text) => aktionen.nachfrage("Ticket", ticket.id, text)}
          onSchliessen={() => setNachfrage(false)}
        />
      )}
    </div>
  );
}

export { SELF_PERSON_ID };
