import { useState, type FormEvent } from "react";
import { PROJECTS, type Eintrag, type Filter, type Prioritaet } from "./types";
import { useEintraege } from "./useEintraege";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, t] = iso.split("-");
  return `${t}.${m}.${y}`;
}

function termineBadgeClass(t: string | null, status: Eintrag["status"]): string {
  if (!t || status === "erledigt") return "";
  const heute = todayISO();
  if (t < heute) return "bad";
  if (t === heute) return "warn";
  return "";
}

const TAB_LABELS: Record<Filter, string> = {
  offen: "Offen",
  ueberfaellig: "Überfällig",
  heute: "Heute fällig",
  erledigt: "Erledigt",
  alle: "Alle",
};

export default function App() {
  const { view, filter, setFilter, conn, addEintrag, toggleDone, cycleStatus, pendingCount } =
    useEintraege();

  const [titel, setTitel] = useState("");
  const [projekt, setProjekt] = useState<string>(PROJECTS[0]);
  const [lead, setLead] = useState("");
  const [termin, setTermin] = useState("");
  const [prioritaet, setPrioritaet] = useState<Prioritaet>("mittel");
  const [ausloeser, setAusloeser] = useState("");
  const [abstimmung, setAbstimmung] = useState("");
  const [beschreibung, setBeschreibung] = useState("");

  const heute = todayISO();

  const counts = {
    offen: 0,
    heute: 0,
    ueberfaellig: 0,
    erledigt: 0,
    alle: view.length,
  };
  view.forEach((t) => {
    if (t.status === "erledigt") {
      counts.erledigt++;
      return;
    }
    counts.offen++;
    if (t.termin === heute) counts.heute++;
    if (t.termin && t.termin < heute) counts.ueberfaellig++;
  });

  const visible = view
    .filter((t) => {
      if (filter === "alle") return true;
      if (filter === "erledigt") return t.status === "erledigt";
      if (t.status === "erledigt") return false;
      if (filter === "offen") return true;
      if (filter === "heute") return t.termin === heute;
      if (filter === "ueberfaellig") return !!t.termin && t.termin < heute;
      return true;
    })
    .sort((a, b) => {
      if (a.status === "erledigt" && b.status !== "erledigt") return 1;
      if (b.status === "erledigt" && a.status !== "erledigt") return -1;
      const at = a.termin || "9999", bt = b.termin || "9999";
      if (at !== bt) return at < bt ? -1 : 1;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = titel.trim();
    if (!t) return;
    addEintrag({
      titel: t,
      projekt,
      lead: lead.trim(),
      ausloeser: ausloeser.trim(),
      abstimmung: abstimmung.trim(),
      termin: termin || null,
      prioritaet,
      beschreibung: beschreibung.trim(),
    });
    setTitel("");
    setLead("");
    setTermin("");
    setPrioritaet("mittel");
    setAusloeser("");
    setAbstimmung("");
    setBeschreibung("");
  }

  return (
    <div className="wrap">
      <header className="top">
        <h1>
          ToDo-Liste_Ticket
          <small>Offene Punkte, Termine, Zuständigkeiten &mdash; ZNA · LAB · KFN · WHF</small>
        </h1>
        <div className={`conn${conn === "offline" ? " offline" : ""}`}>
          <span className="dot" />
          <span>
            {conn === "online"
              ? "synchronisiert"
              : conn === "offline"
              ? pendingCount
                ? `offline · ${pendingCount} ungespeichert`
                : "offline · lokal gespeichert"
              : "verbindet…"}
          </span>
        </div>
      </header>

      <div className="card">
        <form className="add" onSubmit={onSubmit}>
          <div className="row">
            <div className="field grow">
              <label htmlFor="f-titel">Titel</label>
              <input
                id="f-titel"
                required
                placeholder="z.B. Kanalschaden Baustelle Nordseite"
                autoComplete="off"
                value={titel}
                onChange={(e) => setTitel(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="f-projekt">Projekt</label>
              <select id="f-projekt" value={projekt} onChange={(e) => setProjekt(e.target.value)}>
                {PROJECTS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="f-lead">Lead</label>
              <input
                id="f-lead"
                placeholder="z.B. CLS"
                autoComplete="off"
                value={lead}
                onChange={(e) => setLead(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="f-termin">Soll-Termin</label>
              <input
                id="f-termin"
                type="date"
                value={termin}
                onChange={(e) => setTermin(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="f-prio">Priorität</label>
              <select
                id="f-prio"
                value={prioritaet}
                onChange={(e) => setPrioritaet(e.target.value as Prioritaet)}
              >
                <option value="mittel">Mittel</option>
                <option value="hoch">Hoch</option>
                <option value="niedrig">Niedrig</option>
              </select>
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="f-ausloeser">
                Auslöser <span style={{ textTransform: "none", fontWeight: 500 }}>(optional)</span>
              </label>
              <input
                id="f-ausloeser"
                placeholder="Wer hat das ausgelöst?"
                autoComplete="off"
                value={ausloeser}
                onChange={(e) => setAusloeser(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="f-abstimmung">
                Abstimmung mit{" "}
                <span style={{ textTransform: "none", fontWeight: 500 }}>(optional)</span>
              </label>
              <input
                id="f-abstimmung"
                placeholder="Mit wem ggf. abstimmen"
                autoComplete="off"
                value={abstimmung}
                onChange={(e) => setAbstimmung(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="f-beschreibung">
              Beschreibung{" "}
              <span style={{ textTransform: "none", fontWeight: 500 }}>(optional)</span>
            </label>
            <textarea
              id="f-beschreibung"
              placeholder="Details, wer meldet…"
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
            />
          </div>
          <button className="primary" type="submit">
            Aufgabe eintragen
          </button>
        </form>
      </div>

      <div className="tabs" role="tablist">
        {(Object.keys(TAB_LABELS) as Filter[]).map((key) => (
          <button
            key={key}
            className="tab"
            role="tab"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {TAB_LABELS[key]} <span className="count">{counts[key]}</span>
          </button>
        ))}
      </div>

      <ul className="eintraege">
        {visible.length === 0 ? (
          <div className="empty">
            <strong>Nichts zu tun</strong>In dieser Ansicht liegt gerade keine Aufgabe.
          </div>
        ) : (
          visible.map((t) => {
            const tbClass = termineBadgeClass(t.termin, t.status);
            const statusLabel =
              t.status === "offen" ? "Offen" : t.status === "in_bearbeitung" ? "In Bearbeitung" : "Erledigt";
            const nextStatus =
              t.status === "offen" ? "in_bearbeitung" : t.status === "in_bearbeitung" ? "erledigt" : "offen";
            const nextLabel =
              t.status === "offen"
                ? "→ In Bearbeitung"
                : t.status === "in_bearbeitung"
                ? "→ Erledigt"
                : "→ Wieder öffnen";
            return (
              <li key={t.id} className={`eintrag${t.status === "erledigt" ? " erledigt" : ""}`}>
                <button
                  className="check"
                  aria-label="Erledigt markieren"
                  onClick={() => toggleDone(t.id)}
                >
                  {t.status === "erledigt" ? "✓" : ""}
                </button>
                <div className="body2">
                  <div className="titel-row">
                    <span className="titel">{t.titel}</span>
                    {t.vorgangsnummer && <span className="vnr">{t.vorgangsnummer}</span>}
                  </div>
                  <div className="meta">
                    <span className="badge">{t.projekt}</span>
                    {t.lead && <span className="badge">Lead: {t.lead}</span>}
                    {t.ausloeser && <span className="badge">Auslöser: {t.ausloeser}</span>}
                    {t.abstimmung && <span className="badge">Abstimmen mit: {t.abstimmung}</span>}
                    {t.termin && (
                      <span className={`badge termin ${tbClass}`}>{fmtDate(t.termin)}</span>
                    )}
                    {t.prioritaet === "hoch" && <span className="badge prio-hoch">Hoch</span>}
                    {(t as Eintrag & { _pending?: boolean })._pending && (
                      <span className="badge">⏳ wird synchronisiert</span>
                    )}
                    <span className="badge" style={{ opacity: 0.75 }}>
                      {statusLabel}
                    </span>
                  </div>
                  {t.beschreibung && <div className="beschreibung">{t.beschreibung}</div>}
                  <button className="statusbtn" onClick={() => cycleStatus(t.id, nextStatus)}>
                    {nextLabel}
                  </button>
                </div>
              </li>
            );
          })
        )}
      </ul>

      <footer className="note">
        P08 &middot; Synchronisiert automatisch über alle deine Geräte, solange eine Verbindung besteht.
      </footer>
    </div>
  );
}
