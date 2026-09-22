// Delegationsdialog (Kapitel 6 und 13, Abnahmetests T02 bis T06).
//
// Wichtig: Kopieren und Bestaetigen sind zwei getrennte Handlungen. Aus dem
// Erzeugen oder Kopieren eines Textes darf die App NICHT auf einen erfolgten
// Versand schliessen. Erst der ausdrueckliche Klick auf "Delegation bestätigen"
// setzt Delegiert an/am und den Status In Bearbeitung.

import { useEffect, useRef, useState } from "react";
import { Feld } from "./Teile";
import { Personenfeld } from "./Personenfeld";
import { buildMailText } from "../data/mailtext";
import { valueLabel } from "../data/db";
import { formatDate } from "../data/dates";
import { SELF_PERSON_ID, type Database, type EntityType, type WorkItem } from "../data/types";

export function Delegationsdialog({
  db,
  type,
  item,
  ticketTitle,
  onBestaetigen,
  onSchliessen,
  onPersonAnlegen,
}: {
  db: Database;
  type: EntityType;
  item: WorkItem;
  ticketTitle?: string;
  onBestaetigen: (empfaengerId: string, text: string) => void;
  onSchliessen: () => void;
  onPersonAnlegen: (label: string) => string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [kopiert, setKopiert] = useState(false);
  const [empfaenger, setEmpfaenger] = useState(item.leadId !== SELF_PERSON_ID ? item.leadId : "");
  const { text, luecken } = buildMailText(db, type, item, ticketTitle);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Zwischenablage nicht verfuegbar - der Text steht sichtbar im Dialog.
    }
    setKopiert(true);
  }

  return (
    <dialog ref={dialog} onClose={onSchliessen}>
      <h2>Weitergeben an {valueLabel(db, item.leadId)}</h2>

      {luecken.map((luecke, index) => (
        <div key={index} className="hinweis warnung">
          {luecke}
        </div>
      ))}

      <pre className="mailtext">{text}</pre>

      <div className="knopfreihe">
        <button type="button" className="zweit" onClick={kopieren}>
          {kopiert ? "Kopiert" : "Text kopieren"}
        </button>
      </div>
      {kopiert && (
        <div className="hinweis info">
          Kopieren allein ist keine Übergabe – der Vorgang gilt weiterhin als nicht delegiert.
        </div>
      )}

      <hr style={{ border: "none", borderTop: "1px solid var(--line)", margin: "14px 0" }} />

      <Feld label="Tatsächlich übergeben an">
        <Personenfeld
          db={db}
          wert={empfaenger || null}
          onChange={(id) => setEmpfaenger(id ?? "")}
          aktionen={{ anlegen: onPersonAnlegen }}
          listenId={`personen-delegation-${item.id}`}
        />
      </Feld>
      <div className="status-zeile" style={{ marginTop: 6 }}>
        {item.dueDate
          ? `Solltermin bleibt unverändert: ${formatDate(item.dueDate)}`
          : "Kein Solltermin gesetzt – es wird keiner erfunden."}
      </div>

      <div className="knopfreihe">
        <button
          type="button"
          className="haupt"
          disabled={!empfaenger}
          onClick={() => {
            onBestaetigen(empfaenger, text);
            dialog.current?.close();
          }}
        >
          Delegation bestätigen
        </button>
        <button type="button" className="zweit" onClick={() => dialog.current?.close()}>
          Schließen
        </button>
      </div>
      <div className="status-zeile" style={{ marginTop: 8 }}>
        Telefonische Übergabe ist genauso zulässig – bestätige dann hier.
      </div>
    </dialog>
  );
}
