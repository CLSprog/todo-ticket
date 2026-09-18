// Konfliktvorlage beim Abgleich (Kapitel 16, Abnahmetest T15).
//
// Konkurrierende Feldaenderungen werden nicht still ueberschrieben, sondern
// einzeln vorgelegt. Vorbelegt ist der lokale Stand, weil das die Aenderung
// ist, die der Benutzer gerade gemacht hat - entscheiden muss er trotzdem.

import { useEffect, useRef, useState } from "react";
import { conflictKey, type FieldConflict } from "../storage/sync";

function anzeige(value: unknown): string {
  if (value === null || value === undefined || value === "") return "– leer –";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function Konfliktdialog({
  conflicts,
  onEntscheiden,
  onAbbrechen,
}: {
  conflicts: FieldConflict[];
  onEntscheiden: (entscheidungen: Record<string, "lokal" | "entfernt">) => void;
  onAbbrechen: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [wahl, setWahl] = useState<Record<string, "lokal" | "entfernt">>(
    Object.fromEntries(conflicts.map((c) => [conflictKey(c), "lokal" as const])),
  );

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog ref={dialog} onClose={onAbbrechen}>
      <h2>Änderungen von zwei Geräten</h2>
      <div className="hinweis warnung">
        {conflicts.length} Feld{conflicts.length === 1 ? "" : "er"} wurde{conflicts.length === 1 ? "" : "n"} auf beiden
        Seiten geändert. Alles andere ist bereits zusammengeführt.
      </div>

      {conflicts.map((conflict) => {
        const key = conflictKey(conflict);
        return (
          <div key={key} className="karte" style={{ background: "var(--bg)" }}>
            <div style={{ fontWeight: 600 }}>{conflict.beschreibung}</div>
            <div className="status-zeile">Feld: {conflict.field}</div>
            <div className="knopfreihe">
              <button
                type="button"
                className="zweit"
                aria-pressed={wahl[key] === "lokal"}
                style={wahl[key] === "lokal" ? { borderColor: "var(--accent)", color: "var(--accent)", fontWeight: 700 } : undefined}
                onClick={() => setWahl({ ...wahl, [key]: "lokal" })}
              >
                Dieses Gerät: {anzeige(conflict.lokal)}
              </button>
              <button
                type="button"
                className="zweit"
                aria-pressed={wahl[key] === "entfernt"}
                style={wahl[key] === "entfernt" ? { borderColor: "var(--accent)", color: "var(--accent)", fontWeight: 700 } : undefined}
                onClick={() => setWahl({ ...wahl, [key]: "entfernt" })}
              >
                Gespeicherter Stand: {anzeige(conflict.entfernt)}
              </button>
            </div>
          </div>
        );
      })}

      <div className="knopfreihe">
        <button
          type="button"
          className="haupt"
          onClick={() => {
            onEntscheiden(wahl);
            dialog.current?.close();
          }}
        >
          Übernehmen und speichern
        </button>
        <button type="button" className="zweit" onClick={() => dialog.current?.close()}>
          Später entscheiden
        </button>
      </div>
    </dialog>
  );
}
