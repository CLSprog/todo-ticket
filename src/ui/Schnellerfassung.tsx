// Schnellerfassung (D-03, Abnahmetest T01).
//
// Speichern ist bereits mit einem Titel moeglich. Alles Weitere ist
// aufklappbar und optional; es wird insbesondere kein Solltermin verlangt
// und keiner erfunden. Ein Kontextvorschlag (Projekt aus dem aktiven Filter)
// ist als solcher gekennzeichnet und kann abgewaehlt werden.

import { useState } from "react";
import { Feld, Mehrfachauswahl } from "./Teile";
import { valuesOfGroup } from "../data/db";
import type { Database, ID, Priority } from "../data/types";
import { SELF_PERSON_ID } from "../data/types";

export interface NeuesTicket {
  title: string;
  description: string;
  leadId: ID;
  dueDate: string | null;
  priority: Priority;
  trigger: string;
  projekte: ID[];
  abstimmungMit: ID[];
}

export function Schnellerfassung({
  db,
  projektVorschlag,
  onAnlegen,
}: {
  db: Database;
  projektVorschlag: ID[];
  onAnlegen: (eingabe: NeuesTicket) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [leadId, setLeadId] = useState<ID>(SELF_PERSON_ID);
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("Mittel");
  const [trigger, setTrigger] = useState("");
  const [projekte, setProjekte] = useState<ID[]>(projektVorschlag);
  const [abstimmungMit, setAbstimmungMit] = useState<ID[]>([]);
  const [offen, setOffen] = useState(false);

  const personen = valuesOfGroup(db, "Person");
  const projektOptionen = valuesOfGroup(db, "Projekt").map((v) => ({ id: v.id, label: v.label }));
  const vorschlagAktiv = projektVorschlag.length > 0 && projektVorschlag.every((id) => projekte.includes(id));

  function absenden() {
    if (!title.trim()) return;
    onAnlegen({ title, description, leadId, dueDate: dueDate || null, priority, trigger, projekte, abstimmungMit });
    setTitle("");
    setDescription("");
    setLeadId(SELF_PERSON_ID);
    setDueDate("");
    setPriority("Mittel");
    setTrigger("");
    setProjekte(projektVorschlag);
    setAbstimmungMit([]);
    setOffen(false);
  }

  return (
    <div className="karte erfassung">
      <div className="titelzeile">
        <input
          type="text"
          value={title}
          placeholder="Was ist zu tun?"
          aria-label="Titel"
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              absenden();
            }
          }}
        />
        <button className="haupt" type="button" disabled={!title.trim()} onClick={absenden}>
          Anlegen
        </button>
      </div>

      {vorschlagAktiv && (
        <div className="status-zeile">
          Projekt aus dem aktiven Filter übernommen – Vorschlag, kann abgewählt werden.
        </div>
      )}

      <details className="mehr" open={offen} onToggle={(event) => setOffen(event.currentTarget.open)}>
        <summary>Weitere Angaben</summary>
        <div className="feldgitter" style={{ marginTop: 8 }}>
          <Feld label="Lead">
            <select value={leadId} onChange={(event) => setLeadId(event.target.value)}>
              {personen.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </select>
          </Feld>
          <Feld label="Solltermin">
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </Feld>
          <Feld label="Priorität">
            <select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
              <option>Hoch</option>
              <option>Mittel</option>
              <option>Niedrig</option>
            </select>
          </Feld>
          <Feld label="Auslöser / Auftraggeber">
            <input type="text" value={trigger} onChange={(event) => setTrigger(event.target.value)} />
          </Feld>
        </div>
        <div style={{ marginTop: 8 }}>
          <Feld label="Projekt(e)">
            <Mehrfachauswahl optionen={projektOptionen} gewaehlt={projekte} onChange={setProjekte} />
          </Feld>
        </div>
        <div style={{ marginTop: 8 }}>
          <Feld label="Abstimmung mit">
            <Mehrfachauswahl
              optionen={personen.filter((p) => p.id !== SELF_PERSON_ID).map((p) => ({ id: p.id, label: p.label }))}
              gewaehlt={abstimmungMit}
              onChange={setAbstimmungMit}
            />
          </Feld>
        </div>
        <div style={{ marginTop: 8 }}>
          <Feld label="Beschreibung">
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </Feld>
        </div>
      </details>
    </div>
  );
}
