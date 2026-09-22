// =============================================================================
// B04-C06  Konfliktdialog (React)
// -----------------------------------------------------------------------------
// Fassung   : V01-01
// Stand     : 2026-09-19, 13:40
// Herkunft  : B04-C06 V01-00 vom 2026-09-07 (aus P03_Packliste V04-04,
//             src/ConflictModal.tsx), angepasst laut P08-Pruefbericht vom
//             2026-09-19 (Befunde C06-1, C06-3). Baut auf B04-C04 V02-00 auf.
//
// ZWEI AUSNAHMEN VON DEN BAUSTEIN-REGELN - wie schon in V01-00:
// 1. Dieser Baustein braucht React. Ein Projekt ohne React kann ihn nicht nehmen.
// 2. Er bringt Aussehen mit. Klassennamen sind ueber `klassenVorsatz` einstellbar
//    (Vorgabe "bs-conflict"), das CSS muss das Projekt selbst liefern.
// Damit ist er eine andere Klasse als C01-C05, C07, C08. Wer nur die Logik
// braucht, nimmt B04-C04 und baut die Anzeige selbst.
//
// WAS GEGENUEBER V01-00 ANDERS IST - zwei Befunde aus der Pruefung
//
// 1. NAMEN STATT IDs (C06-1).
//    V01-00 blendete nur `id` und Felder mit dem Vorsatz `id_` aus. P08s
//    Fremdschluessel heissen aber leadId, ownerId, personIds - die fielen
//    durch den Filter und erschienen als nackte UUID ("Lead: b57102e5-...").
//    Genau dieser Fehler war Clemens am 18.09. im Mailtext begegnet.
//    Jetzt: eine Wertaufbereitung `formatiere(tabelle, feld, wert, zeile)`
//    uebersetzt jeden Wert fuers Anzeigen - IDs in Namen, Zeitstempel in
//    Datumsform, was auch immer das Projekt braucht. Ohne Angabe wird der
//    Rohwert gezeigt (Rueckfallverhalten wie bisher, aber wenigstens nicht
//    mehr durch einen kaputten Filter verdeckt).
//    Zusaetzlich: `verbergen` blendet interne Buchhaltungsfelder aus
//    (Vorgabe: revision, createdAt, updatedAt, deletedAt).
//
// 2. FELDGENAU STATT ZEILENGENAU (C06-3).
//    B04-C04 V02-00 liefert jetzt FELD-Konflikte (dieselbe Stelle, verschiedene
//    Werte) getrennt von ZEILEN-Konflikten (eine Seite hat geloescht, die
//    andere geaendert). Dieser Dialog zeigt beide: Feldkonflikte als einzelne,
//    fuer sich entscheidbare Zeilen; Zeilenkonflikte wie bisher als Vergleich
//    zweier ganzer Seiten. Gehoeren mehrere Feldkonflikte zur selben Zeile
//    (z. B. Frist UND Titel strittig), erscheinen sie gruppiert unter einer
//    gemeinsamen Ueberschrift, aber weiterhin EINZELN entscheidbar.
//
// C06-2 ENTFAELLT - AUSDRUECKLICHE ENTSCHEIDUNG VON CLEMENS (2026-09-19, 12:54):
//    "Es gibt kein spaeter entscheiden, hier muss ich immer eine klare
//    Entscheidung treffen. Wenn ich etwas Falsches sofort entscheide, kann
//    ich es spaeter noch aendern." Und auf die Frage nach einer Erinnerung:
//    "Das wird es nicht geben." Der Dialog bleibt daher OHNE Ausgang: kein
//    Abbrechen, kein Escape, der Uebernehmen-Knopf bleibt gesperrt, bis JEDE
//    Stelle entschieden ist - wie in V01-00 angelegt. Siehe
//    P08_Entscheidung Konfliktdialog kein Ausgang_V01-00.
//
// ZWECK (unveraendert)
// Zeigt die Konflikte aus B04-C04 nebeneinander und laesst den Menschen JE
// STELLE entscheiden. Der Uebernehmen-Knopf bleibt gesperrt, bis alles
// entschieden ist - absichtlich: ein Sammelknopf "alles von mir" waere bequem
// und wuerde regelmaessig fremde Arbeit vernichten.
//
// VERTRAG (aendert sich nur mit VV)
//   gruppiereKonflikte(konflikte, zeilenKonflikte)  -> Konfliktzeile[]
//   alleKonfliktSchluessel(gruppen)                 -> string[]
//   alleEntschieden(schluessel, wahl)                -> boolean
//   <Konfliktdialog konflikte=... zeilenKonflikte=... beiEntscheidung=...
//                    formatiere? verbergen? texte? klassenVorsatz? />
//   beiEntscheidung erhaelt eine Map "tabelle|id|feld" bzw. "tabelle|id"
//   -> "lokal" | "entfernt" (siehe B04-C04 V02-00 konfliktSchluessel)
//
// NICHT durch einen Selbsttest der DARSTELLUNG abgedeckt: dafuer braeuchte es
// eine Darstellungsumgebung. Was sich ohne Darstellung pruefen laesst - die
// Gruppierung, die Vollstaendigkeitspruefung -, ist als reine Funktion
// herausgezogen und getestet (siehe tests/bausteine.ts). Geprueft wird die
// Anzeige selbst im laufenden Projekt; Clemens haelt das im Detail dagegen.
//
// NICHT BEHOBEN (C06-4, nachrangig): keine Bedienhilfen (role="dialog",
// Fokusfang, Escape). Bleibt fuer eine spaetere Fassung offen.
// =============================================================================
import { useState } from "react";
import {
  konfliktSchluessel,
  type FeldKonflikt,
  type Zeile,
  type ZeilenKonflikt,
} from "./B04-C04_Drei-Wege-Abgleich_V02-00";

// -----------------------------------------------------------------------------
// Reine Logik - ohne Darstellung testbar
// -----------------------------------------------------------------------------

/** Eine Zeile im Dialog: entweder ein Zeilenkonflikt (geloescht/geaendert),
 *  oder ein bis mehrere Feldkonflikte derselben Stelle, oder beides zugleich
 *  kann nicht vorkommen - B04-C04 meldet fuer dieselbe id entweder das eine
 *  oder das andere. */
export interface Konfliktzeile {
  tabelle: string;
  /** "" bei einem Konflikt ausserhalb einer Tabelle (z. B. meta). */
  id: string;
  label: string;
  zeilenKonflikt: ZeilenKonflikt | null;
  feldKonflikte: FeldKonflikt[];
}

function gruppenSchluessel(tabelle: string, id: string): string {
  return `${tabelle}\u0000${id}`;
}

/** Fasst Feld- und Zeilenkonflikte zeilenweise zusammen, in der Reihenfolge
 *  ihres ersten Auftretens. */
export function gruppiereKonflikte(
  konflikte: FeldKonflikt[],
  zeilenKonflikte: ZeilenKonflikt[],
): Konfliktzeile[] {
  const karte = new Map<string, Konfliktzeile>();
  const reihenfolge: string[] = [];

  for (const zk of zeilenKonflikte) {
    const k = gruppenSchluessel(zk.tabelle, zk.id);
    karte.set(k, { tabelle: zk.tabelle, id: zk.id, label: zk.label, zeilenKonflikt: zk, feldKonflikte: [] });
    reihenfolge.push(k);
  }
  for (const fk of konflikte) {
    const k = gruppenSchluessel(fk.tabelle, fk.id);
    const vorhanden = karte.get(k);
    if (vorhanden) {
      vorhanden.feldKonflikte.push(fk);
    } else {
      karte.set(k, { tabelle: fk.tabelle, id: fk.id, label: fk.label, zeilenKonflikt: null, feldKonflikte: [fk] });
      reihenfolge.push(k);
    }
  }
  return reihenfolge.map((k) => karte.get(k)!);
}

/** Alle Entscheidungsschluessel, die eine Gruppenliste verlangt. */
export function alleKonfliktSchluessel(gruppen: Konfliktzeile[]): string[] {
  const liste: string[] = [];
  for (const gruppe of gruppen) {
    if (gruppe.zeilenKonflikt) liste.push(konfliktSchluessel(gruppe.zeilenKonflikt));
    for (const fk of gruppe.feldKonflikte) liste.push(konfliktSchluessel(fk));
  }
  return liste;
}

/** true, wenn zu jedem Schluessel eine Entscheidung vorliegt. */
export function alleEntschieden(
  schluessel: string[],
  wahl: Map<string, "lokal" | "entfernt">,
): boolean {
  return schluessel.every((s) => wahl.has(s));
}

// -----------------------------------------------------------------------------
// Darstellung
// -----------------------------------------------------------------------------

/** Uebersetzt einen Rohwert fuers Anzeigen - z. B. eine ID in einen Namen.
 *  `zeile` ist die Zeile, aus der der Wert stammt (lokal ODER entfernt, je
 *  nachdem, welche Seite gerade gezeichnet wird), oder null bei einem Konflikt
 *  ausserhalb einer Tabelle. */
export type WertFormatierer = (
  tabelle: string,
  feld: string,
  wert: unknown,
  zeile: Zeile | null,
) => string;

function formatiereStandard(_tabelle: string, _feld: string, wert: unknown): string {
  if (wert === null || wert === undefined) return "—";
  if (wert === "") return "(leer)";
  if (Array.isArray(wert)) return wert.length === 0 ? "(leer)" : wert.map(String).join(", ");
  return String(wert);
}

const INTERNE_FELDER_STANDARD = ["revision", "createdAt", "updatedAt", "deletedAt"];

export interface KonfliktdialogTexte {
  titel?: string;
  /** Erhaelt die Anzahl der Zeilen und liefert den Einleitungssatz. */
  einleitung?: (anzahl: number) => string;
  seiteLokal?: string;
  seiteEntfernt?: string;
  geloeschtLokal?: string;
  geloeschtEntfernt?: string;
  uebernehmen?: string;
  /** Erhaelt die Anzahl der noch offenen Zeilen. */
  offen?: (anzahl: number) => string;
  /** Beschriftung je Feldname; unbekannte Felder erscheinen unveraendert. */
  felder?: Record<string, string>;
}

const VORGABE: Required<Omit<KonfliktdialogTexte, "felder">> & { felder: Record<string, string> } = {
  titel: "Unterschiedliche Änderungen auf zwei Geräten",
  einleitung: (n) =>
    `${n === 1 ? "Diese Stelle wurde" : `${n} Stellen wurden`} sowohl auf diesem als auch auf einem ` +
    `anderen Gerät verändert. Bitte für jede Stelle einzeln auswählen, welcher Stand gelten soll.`,
  seiteLokal: "Dein Stand (dieses Gerät)",
  seiteEntfernt: "Anderes Gerät",
  geloeschtLokal: "(auf diesem Gerät gelöscht)",
  geloeschtEntfernt: "(auf dem anderen Gerät gelöscht)",
  uebernehmen: "Übernehmen & speichern",
  offen: (n) => `Noch ${n} zu entscheiden`,
  felder: {},
};

function anzeigbareFelder(
  zeile: Record<string, unknown> | null,
  verbergen: string[],
): [string, unknown][] {
  if (!zeile) return [];
  const verboten = new Set(["id", ...verbergen]);
  return Object.entries(zeile).filter(([k]) => !verboten.has(k));
}

export interface KonfliktdialogProps {
  konflikte: FeldKonflikt[];
  zeilenKonflikte: ZeilenKonflikt[];
  beiEntscheidung: (wahl: Map<string, "lokal" | "entfernt">) => void;
  /** Uebersetzt Rohwerte fuers Anzeigen (IDs -> Namen, Zeitstempel -> Datum, …). */
  formatiere?: WertFormatierer;
  /** Zusaetzlich zu id auszublendende Felder. Vorgabe: interne Buchhaltung. */
  verbergen?: string[];
  texte?: KonfliktdialogTexte;
  klassenVorsatz?: string;
}

export default function Konfliktdialog({
  konflikte,
  zeilenKonflikte,
  beiEntscheidung,
  formatiere = formatiereStandard,
  verbergen = INTERNE_FELDER_STANDARD,
  texte,
  klassenVorsatz = "bs-conflict",
}: KonfliktdialogProps) {
  const [wahl, setWahl] = useState<Map<string, "lokal" | "entfernt">>(new Map());
  const t = { ...VORGABE, ...texte, felder: { ...VORGABE.felder, ...(texte?.felder ?? {}) } };
  const k = (teil: string) => `${klassenVorsatz}-${teil}`;

  const gruppen = gruppiereKonflikte(konflikte, zeilenKonflikte);
  const schluesselListe = alleKonfliktSchluessel(gruppen);
  const fertig = alleEntschieden(schluesselListe, wahl);

  function waehlen(schluessel: string, entscheidung: "lokal" | "entfernt") {
    setWahl((vorher) => new Map(vorher).set(schluessel, entscheidung));
  }

  // --- eine Seite eines Zeilenkonflikts (ganze Zeile) -----------------------
  function zeilenSeite(
    konflikt: ZeilenKonflikt,
    schluessel: string,
    art: "lokal" | "entfernt",
    titel: string,
    geloeschtText: string,
  ) {
    const zeile = art === "lokal" ? konflikt.lokal : konflikt.entfernt;
    const gewaehlt = wahl.get(schluessel) === art;
    return (
      <button
        type="button"
        className={k("side") + (gewaehlt ? " chosen" : "")}
        onClick={() => waehlen(schluessel, art)}
      >
        <div className={k("side-title")}>{titel}</div>
        {zeile ? (
          anzeigbareFelder(zeile, verbergen).map(([feld, wert]) => (
            <div className={k("field")} key={feld}>
              <span>{t.felder[feld] ?? feld}</span>
              <b>{formatiere(konflikt.tabelle, feld, wert, zeile)}</b>
            </div>
          ))
        ) : (
          <div className={k("field")}>{geloeschtText}</div>
        )}
      </button>
    );
  }

  // --- eine Seite eines Feldkonflikts (ein einzelner Wert) ------------------
  function feldSeite(
    konflikt: FeldKonflikt,
    schluessel: string,
    art: "lokal" | "entfernt",
    titel: string,
  ) {
    const wert = art === "lokal" ? konflikt.lokal : konflikt.entfernt;
    const gewaehlt = wahl.get(schluessel) === art;
    return (
      <button
        type="button"
        className={k("side") + (gewaehlt ? " chosen" : "")}
        onClick={() => waehlen(schluessel, art)}
      >
        <div className={k("side-title")}>{titel}</div>
        <div className={k("field")}>
          <b>{formatiere(konflikt.tabelle, konflikt.feld, wert, null)}</b>
        </div>
      </button>
    );
  }

  return (
    <div className={k("backdrop")}>
      <div className={k("panel")}>
        <h2>{t.titel}</h2>
        <p className={k("intro")}>{t.einleitung(gruppen.length)}</p>
        <div className={k("list")}>
          {gruppen.map((gruppe) => {
            const gruppenSchl = gruppenSchluessel(gruppe.tabelle, gruppe.id);
            return (
              <div className={k("group")} key={gruppenSchl}>
                <div className={k("group-label")}>{gruppe.label}</div>

                {gruppe.zeilenKonflikt && (
                  <div className={k("row")}>
                    <div className={k("sides")}>
                      {zeilenSeite(
                        gruppe.zeilenKonflikt,
                        konfliktSchluessel(gruppe.zeilenKonflikt),
                        "lokal",
                        t.seiteLokal,
                        t.geloeschtLokal,
                      )}
                      {zeilenSeite(
                        gruppe.zeilenKonflikt,
                        konfliktSchluessel(gruppe.zeilenKonflikt),
                        "entfernt",
                        t.seiteEntfernt,
                        t.geloeschtEntfernt,
                      )}
                    </div>
                  </div>
                )}

                {gruppe.feldKonflikte.map((fk) => {
                  const schluessel = konfliktSchluessel(fk);
                  return (
                    <div className={k("row")} key={schluessel}>
                      <div className={k("field-label")}>{t.felder[fk.feld] ?? fk.feld}</div>
                      <div className={k("sides")}>
                        {feldSeite(fk, schluessel, "lokal", t.seiteLokal)}
                        {feldSeite(fk, schluessel, "entfernt", t.seiteEntfernt)}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className={k("actions")}>
          <button
            type="button"
            className={k("submit")}
            disabled={!fertig}
            onClick={() => beiEntscheidung(wahl)}
          >
            {fertig ? t.uebernehmen : t.offen(schluesselListe.length - wahl.size)}
          </button>
        </div>
      </div>
    </div>
  );
}
