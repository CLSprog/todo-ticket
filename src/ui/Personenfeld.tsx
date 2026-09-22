// Personenfelder mit freier Eingabe.
//
// Clemens' Vorgabe vom 18.09.2026: Eine reine Auswahlliste genügt nicht. Namen
// wiederholen sich zwar, es kommen aber laufend neue dazu, und der Umweg über
// die Einstellungen ist für die schnelle Erfassung zu langsam.
//
// Verhalten: aus der Liste wählen ODER einen neuen Namen tippen. Beim
// Übernehmen wird der neue Name dauerhaft in die Werteliste geschrieben und
// steht beim nächsten Mal zur Auswahl.
//
// Dublettenschutz: Vor dem Anlegen wird gegen Bezeichnung UND Aliasse
// verglichen, ohne Rücksicht auf Groß- und Kleinschreibung und auf mehrfache
// Leerzeichen. "julian", "Julian" und " Julian " führen deshalb auf denselben
// Eintrag. Unterschiedliche Schreibweisen desselben Menschen ("J. Berger"
// gegenüber "Julian Berger") kann die App nicht erkennen - dafür gibt es die
// Aliasse in den Einstellungen.

import { useRef, useState } from "react";
import { valuesOfGroup } from "../data/db";
import type { Database, ID, ValueItem } from "../data/types";

/** Vergleichsform: getrimmt, Mehrfachleerzeichen zusammengezogen, kleingeschrieben. */
export function vergleichsform(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Sucht eine vorhandene Person; berücksichtigt Bezeichnung und Aliasse. */
export function findePerson(db: Database, eingabe: string): ValueItem | undefined {
  const gesucht = vergleichsform(eingabe);
  if (!gesucht) return undefined;
  return db.values.find(
    (wert) =>
      wert.group === "Person" &&
      (vergleichsform(wert.label) === gesucht ||
        (wert.aliases ?? []).some((alias) => vergleichsform(alias) === gesucht)),
  );
}

export interface PersonenfeldAktionen {
  /** Legt eine neue Person an und liefert deren ID zurück. */
  anlegen: (label: string) => ID;
}

// ---------------------------------------------------------------- Einzelfeld

export function Personenfeld({
  db,
  wert,
  onChange,
  aktionen,
  listenId,
  pflicht = false,
}: {
  db: Database;
  wert: ID | null;
  onChange: (id: ID | null) => void;
  aktionen: PersonenfeldAktionen;
  /** Eindeutige Kennung der Vorschlagsliste; mehrere Felder auf einer Seite brauchen verschiedene. */
  listenId: string;
  pflicht?: boolean;
}) {
  const personen = valuesOfGroup(db, "Person");
  const aktuellerName = wert ? (db.values.find((v) => v.id === wert)?.label ?? "") : "";
  const [text, setText] = useState(aktuellerName);
  const [zuletztGezeigt, setZuletztGezeigt] = useState(aktuellerName);
  const zuletztUebernommen = useRef(aktuellerName);

  // Wird der Wert von aussen geaendert (z.B. nach dem Laden), Text nachziehen.
  if (aktuellerName !== zuletztGezeigt) {
    setZuletztGezeigt(aktuellerName);
    setText(aktuellerName);
    zuletztUebernommen.current = aktuellerName;
  }

  function uebernehmen(eingabe: string) {
    const sauber = eingabe.trim().replace(/\s+/g, " ");
    // Eingabetaste und anschliessendes Verlassen des Feldes liefern denselben
    // Text zweimal. Der zweite Durchlauf darf nichts erneut anlegen.
    if (sauber === zuletztUebernommen.current) return;
    zuletztUebernommen.current = sauber;
    if (!sauber) {
      if (!pflicht) onChange(null);
      setText(aktuellerName);
      return;
    }
    const vorhanden = findePerson(db, sauber);
    if (vorhanden) {
      onChange(vorhanden.id);
      setText(vorhanden.label); // auf die hinterlegte Schreibweise vereinheitlichen
      return;
    }
    const neueId = aktionen.anlegen(sauber);
    onChange(neueId);
    setText(sauber);
  }

  const istNeu = text.trim() !== "" && !findePerson(db, text);

  return (
    <div>
      <input
        type="text"
        list={listenId}
        value={text}
        placeholder="Name wählen oder eintippen"
        onChange={(event) => setText(event.target.value)}
        onBlur={(event) => uebernehmen(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            uebernehmen((event.target as HTMLInputElement).value);
            (event.target as HTMLInputElement).blur();
          }
        }}
        style={{
          width: "100%",
          padding: 10,
          borderRadius: 8,
          border: "1px solid var(--line)",
          background: "var(--bg)",
          color: "var(--text)",
          font: "inherit",
        }}
      />
      <datalist id={listenId}>
        {personen.map((person) => (
          <option key={person.id} value={person.label} />
        ))}
      </datalist>
      {istNeu && <div className="status-zeile">Neuer Name – wird beim Übernehmen angelegt</div>}
    </div>
  );
}

// ------------------------------------------------------------ Mehrfachfeld

export function Personenmehrfachfeld({
  db,
  werte,
  onChange,
  aktionen,
  listenId,
}: {
  db: Database;
  werte: ID[];
  onChange: (ids: ID[]) => void;
  aktionen: PersonenfeldAktionen;
  listenId: string;
}) {
  const [text, setText] = useState("");
  const personen = valuesOfGroup(db, "Person").filter((person) => !werte.includes(person.id));

  function hinzufuegen(eingabe: string) {
    const sauber = eingabe.trim().replace(/\s+/g, " ");
    if (!sauber) return;
    const vorhanden = findePerson(db, sauber);
    const id = vorhanden ? vorhanden.id : aktionen.anlegen(sauber);
    if (!werte.includes(id)) onChange([...werte, id]);
    setText("");
  }

  return (
    <div>
      <div className="mehrfach" style={{ marginBottom: werte.length > 0 ? 6 : 0 }}>
        {werte.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={true}
            title="Entfernen"
            onClick={() => onChange(werte.filter((vorhanden) => vorhanden !== id))}
          >
            {db.values.find((v) => v.id === id)?.label ?? id} ×
          </button>
        ))}
      </div>
      <input
        type="text"
        list={listenId}
        value={text}
        placeholder="Name wählen oder eintippen"
        onChange={(event) => setText(event.target.value)}
        onBlur={(event) => hinzufuegen(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            hinzufuegen((event.target as HTMLInputElement).value);
          }
        }}
        style={{
          width: "100%",
          padding: 10,
          borderRadius: 8,
          border: "1px solid var(--line)",
          background: "var(--bg)",
          color: "var(--text)",
          font: "inherit",
        }}
      />
      <datalist id={listenId}>
        {personen.map((person) => (
          <option key={person.id} value={person.label} />
        ))}
      </datalist>
    </div>
  );
}
