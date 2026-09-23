// Einstellungen: Speicher, Regeln, Wertelisten, Sicherung.
//
// Kapitel 17: Die Automatik muss nachvollziehbar bleiben. Deshalb stehen hier
// alle Regeln mit Festlegungsstand, Schalter und Parametern sichtbar - offene
// Regeln duerfen nicht als aktiv gelten, und kein Wert steckt versteckt im Code.

import { useState } from "react";
import { Feld } from "./Teile";
import { valuesOfGroup } from "../data/db";
import type { Pruefergebnis } from "../bausteine/B04-C01_Cloud-Speicher_V02-00";
import { APP_VERSION, VALUE_GROUPS, type Database, type Rule, type ValueItem } from "../data/types";

export function Einstellungen({
  db,
  speicherId,
  angemeldet,
  onSpeicherWechsel,
  onAnmelden,
  onAbmelden,
  onSpeicherpruefung,
  onRegelAendern,
  onWertAnlegen,
  onWertAendern,
  onExportJson,
  onExportExcel,
  onImport,
}: {
  db: Database;
  speicherId: string;
  angemeldet: boolean;
  onSpeicherWechsel: (id: string) => void;
  onAnmelden: () => void;
  onAbmelden: () => void;
  /** Nur vorhanden, wenn eine Pruefung gerade sinnvoll ist (OneDrive, angemeldet).
   *  Fuehrt B04-C01s speicherpruefung() gegen die echte Ablage aus - der von
   *  hier aus nicht ersetzbare Nachweis fuer Riegel 1/2 (siehe
   *  P08_Graph-Befund-bedingtes-Schreiben). */
  onSpeicherpruefung?: () => Promise<Pruefergebnis>;
  onRegelAendern: (rule: Rule) => void;
  onWertAnlegen: (gruppe: string, label: string) => void;
  onWertAendern: (wert: ValueItem) => void;
  onExportJson: () => void;
  onExportExcel: () => void;
  onImport: (datei: File) => void;
}) {
  const [gruppe, setGruppe] = useState<string>("Person");
  const [neuerWert, setNeuerWert] = useState("");
  const [pruefLaeuft, setPruefLaeuft] = useState(false);
  const [pruefErgebnis, setPruefErgebnis] = useState<Pruefergebnis | null>(null);

  return (
    <div>
      <div className="karte">
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Speicherort</h2>
        <Feld label="Datenbestand liegt in">
          <select value={speicherId} onChange={(event) => onSpeicherWechsel(event.target.value)}>
            <option value="local">Nur auf diesem Gerät</option>
            <option value="onedrive">OneDrive (geräteübergreifend)</option>
          </select>
        </Feld>
        {speicherId === "onedrive" && (
          <div className="knopfreihe">
            {angemeldet ? (
              <button type="button" className="zweit" onClick={onAbmelden}>
                Abmelden
              </button>
            ) : (
              <button type="button" className="haupt" onClick={onAnmelden}>
                Mit Microsoft anmelden
              </button>
            )}
          </div>
        )}
        <div className="status-zeile" style={{ marginTop: 8 }}>
          OneDrive-Ablage: _KI/ThinkTank/P08_ToDo-Liste/07_Database
        </div>
        {onSpeicherpruefung && (
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="zweit"
              disabled={pruefLaeuft}
              onClick={() => {
                setPruefLaeuft(true);
                setPruefErgebnis(null);
                onSpeicherpruefung()
                  .then(setPruefErgebnis)
                  .finally(() => setPruefLaeuft(false));
              }}
            >
              {pruefLaeuft ? "Prüfung läuft …" : "Speicher prüfen (Riegel 1/2)"}
            </button>
            {pruefErgebnis && (
              <div
                className="status-zeile"
                style={{ marginTop: 8, fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" }}
              >
                {pruefErgebnis.zeilen.join("\n")}
                {"\n"}
                Riegel 1: {pruefErgebnis.riegel1Wirkt ? "wirkt" : "wirkt NICHT"} · Riegel 2:{" "}
                {pruefErgebnis.riegel2Wirkt === "nichtPruefbar" ? "nicht prüfbar" : pruefErgebnis.riegel2Wirkt ? "wirkt" : "wirkt nicht"}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="karte">
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Sicherung und Weitergabe</h2>
        <div className="knopfreihe">
          <button type="button" className="zweit" onClick={onExportJson}>
            JSON exportieren
          </button>
          <button type="button" className="zweit" onClick={onExportExcel}>
            Excel-Snapshot
          </button>
          <label className="zweit" style={{ cursor: "pointer" }}>
            Wiederherstellen …
            <input
              type="file"
              accept=".json,.xlsx"
              style={{ display: "none" }}
              onChange={(event) => {
                const datei = event.target.files?.[0];
                if (datei) onImport(datei);
                event.target.value = "";
              }}
            />
          </label>
        </div>
        <div className="status-zeile" style={{ marginTop: 8 }}>
          Wiederherstellen zeigt zuerst eine Vorschau. Der Export hebt die Datenrevision nicht an.
        </div>
      </div>

      <div className="karte">
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Regeln</h2>
        <table className="regeln">
          <thead>
            <tr>
              <th>ID</th>
              <th>Regel</th>
              <th>Stand</th>
              <th>Aktiv</th>
            </tr>
          </thead>
          <tbody>
            {db.rules.map((rule) => (
              <tr key={rule.id}>
                <td>{rule.id}</td>
                <td>
                  <strong>{rule.name}</strong>
                  <div className="status-zeile">{rule.action}</div>
                  {Object.keys(rule.parameters).length > 0 && (
                    <div className="status-zeile" style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {JSON.stringify(rule.parameters)}
                    </div>
                  )}
                </td>
                <td>
                  <span className={`marke${rule.state === "Offen" ? " warnung" : rule.state === "Festgelegt" ? " ok" : ""}`}>
                    {rule.state}
                  </span>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    aria-label={`Regel ${rule.id} aktiv`}
                    onChange={(event) => onRegelAendern({ ...rule, enabled: event.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="status-zeile" style={{ marginTop: 8 }}>
          Offene Punkte laut Konzept: Feiertagskalender, Uhrzeit des Hinweises und Kanal bei geschlossener App (O-02,
          O-06). Ohne Feiertagsliste zählen Montag bis Freitag als Arbeitstage.
        </div>
      </div>

      <div className="karte">
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Wertelisten</h2>
        <Feld label="Gruppe">
          <select value={gruppe} onChange={(event) => setGruppe(event.target.value)}>
            {VALUE_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Feld>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            type="text"
            placeholder={`Neuer Wert in „${gruppe}“`}
            value={neuerWert}
            onChange={(event) => setNeuerWert(event.target.value)}
            style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--text)", font: "inherit" }}
          />
          <button
            type="button"
            className="zweit"
            disabled={!neuerWert.trim()}
            onClick={() => {
              onWertAnlegen(gruppe, neuerWert.trim());
              setNeuerWert("");
            }}
          >
            Anlegen
          </button>
        </div>
        <table className="regeln" style={{ marginTop: 10 }}>
          <tbody>
            {valuesOfGroup(db, gruppe, true).map((wert) => (
              <tr key={wert.id}>
                <td style={{ width: "60%" }}>
                  <input
                    type="text"
                    defaultValue={wert.label}
                    onBlur={(event) => onWertAendern({ ...wert, label: event.target.value })}
                    style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--text)", font: "inherit" }}
                  />
                </td>
                <td>
                  <label style={{ fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={wert.active}
                      onChange={(event) => onWertAendern({ ...wert, active: event.target.checked })}
                    />{" "}
                    aktiv
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="status-zeile" style={{ marginTop: 8 }}>
          Deaktivierte Werte verschwinden aus der Auswahl, bleiben in bestehenden Zuordnungen aber gültig.
        </div>
      </div>

      <div className="karte">
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Über</h2>
        <div className="status-zeile">
          Laufende App-Fassung: <b>{APP_VERSION}</b>
        </div>
        <div className="status-zeile" style={{ marginTop: 4 }}>
          Konzept {String(db.meta.conceptVersion)} · Schema {String(db.meta.schemaVersion)} ·
          Datenrevision {String(db.meta.dataRevision)}
        </div>
        {db.meta.appVersion !== APP_VERSION && (
          <div className="status-zeile" style={{ marginTop: 4 }}>
            Diese Datei wurde ursprünglich mit App-Fassung {String(db.meta.appVersion)} angelegt.
          </div>
        )}
      </div>
    </div>
  );
}
