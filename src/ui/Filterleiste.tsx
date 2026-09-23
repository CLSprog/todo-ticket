// Situationsfilter. Schnellansichten oben, die Kombination darunter
// aufklappbar - am Handy soll die Liste nicht von Filterfeldern verdeckt werden.

import { Feld, Mehrfachauswahl } from "./Teile";
import { valuesOfGroup } from "../data/db";
import { PERSON_ROLES, type Database } from "../data/types";
import type { FilterState, QuickView } from "../data/filter";

const SCHNELL: { id: QuickView; label: string }[] = [
  { id: "offen", label: "Offen" },
  { id: "inBearbeitung", label: "In Bearbeitung" },
  { id: "ueberfaellig", label: "Überfällig" },
  { id: "heute", label: "Heute fällig" },
  { id: "zuDelegieren", label: "Zu delegieren" },
  { id: "ohneZuordnung", label: "Ohne Zuordnung" },
  { id: "erledigt", label: "Erledigt" },
  { id: "alle", label: "Alle" },
];

export function Filterleiste({
  db,
  filter,
  onChange,
}: {
  db: Database;
  filter: FilterState;
  onChange: (filter: FilterState) => void;
}) {
  const setze = (patch: Partial<FilterState>) => onChange({ ...filter, ...patch });
  const personen = valuesOfGroup(db, "Person");

  return (
    <div className="karte filterleiste">
      <input
        type="text"
        placeholder="In Titel, Beschreibung und Verlauf suchen"
        value={filter.text}
        aria-label="Suche"
        onChange={(event) => setze({ text: event.target.value })}
        style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--text)", font: "inherit" }}
      />

      <div className="schnell">
        {SCHNELL.map((ansicht) => (
          <button
            key={ansicht.id}
            type="button"
            className="zweit"
            aria-pressed={filter.quick === ansicht.id}
            onClick={() => setze({ quick: ansicht.id })}
          >
            {ansicht.label}
          </button>
        ))}
      </div>

      <details className="mehr">
        <summary>Situation wählen</summary>
        <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
          <Feld label="Projekt">
            <Mehrfachauswahl
              optionen={valuesOfGroup(db, "Projekt").map((v) => ({ id: v.id, label: v.label }))}
              gewaehlt={filter.projekte}
              onChange={(projekte) => setze({ projekte })}
            />
          </Feld>
          <Feld label="Thema">
            <Mehrfachauswahl
              optionen={valuesOfGroup(db, "Thema").map((v) => ({ id: v.id, label: v.label }))}
              gewaehlt={filter.themen}
              onChange={(themen) => setze({ themen })}
            />
          </Feld>
          <Feld label="Besprechungskreis">
            <Mehrfachauswahl
              optionen={valuesOfGroup(db, "Besprechungskreis").map((v) => ({ id: v.id, label: v.label }))}
              gewaehlt={filter.besprechungen}
              onChange={(besprechungen) => setze({ besprechungen })}
            />
          </Feld>
          <Feld label="Arbeitsart">
            <Mehrfachauswahl
              optionen={valuesOfGroup(db, "Arbeitsart").map((v) => ({ id: v.id, label: v.label }))}
              gewaehlt={filter.arbeitsarten}
              onChange={(arbeitsarten) => setze({ arbeitsarten })}
            />
          </Feld>
          <div className="feldgitter">
            <Feld label="Person">
              <select value={filter.person ?? ""} onChange={(event) => setze({ person: event.target.value || null })}>
                <option value="">– alle –</option>
                {personen.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
              </select>
            </Feld>
            <Feld label="Rolle">
              <select
                value={filter.personRolle}
                disabled={!filter.person}
                onChange={(event) => setze({ personRolle: event.target.value as FilterState["personRolle"] })}
              >
                <option value="Alle">Alle Rollen</option>
                {PERSON_ROLES.map((rolle) => (
                  <option key={rolle} value={rolle}>
                    {rolle}
                  </option>
                ))}
              </select>
            </Feld>
          </div>
          <Feld label="Priorität">
            <Mehrfachauswahl
              optionen={["Hoch", "Mittel", "Niedrig"].map((p) => ({ id: p, label: p }))}
              gewaehlt={filter.prioritaeten}
              onChange={(prioritaeten) => setze({ prioritaeten })}
            />
          </Feld>
          <div className="feldgitter">
            <Feld label="Solltermin von">
              <input
                type="date"
                value={filter.solltermVon ?? ""}
                onChange={(event) => setze({ solltermVon: event.target.value || null })}
              />
            </Feld>
            <Feld label="Solltermin bis">
              <input
                type="date"
                value={filter.solltermBis ?? ""}
                onChange={(event) => setze({ solltermBis: event.target.value || null })}
              />
            </Feld>
          </div>
          <div className="feldgitter">
            <Feld label="Erledigt von">
              <input
                type="date"
                value={filter.erledigtVon ?? ""}
                onChange={(event) => setze({ erledigtVon: event.target.value || null })}
              />
            </Feld>
            <Feld label="Erledigt bis">
              <input
                type="date"
                value={filter.erledigtBis ?? ""}
                onChange={(event) => setze({ erledigtBis: event.target.value || null })}
              />
            </Feld>
          </div>
        </div>
      </details>
    </div>
  );
}
