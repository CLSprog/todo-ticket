// Kleine, in mehreren Ansichten benutzte Bausteine der Oberflaeche.

import type { ReactNode } from "react";
import type { Hint } from "../data/derive";

export function Feld({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="feld">
      <label>{label}</label>
      {children}
    </div>
  );
}

export function Marke({ art, children }: { art?: "dringend" | "warnung" | "ok" | "geerbt"; children: ReactNode }) {
  return <span className={`marke${art ? ` ${art}` : ""}`}>{children}</span>;
}

export function Hinweise({ hints }: { hints: Hint[] }) {
  if (hints.length === 0) return null;
  return (
    <div className="marken">
      {hints.map((hint, index) => (
        <Marke key={index} art={hint.level === "info" ? undefined : hint.level}>
          {hint.label}
        </Marke>
      ))}
    </div>
  );
}

export interface Option {
  id: string;
  label: string;
}

/** Mehrfachauswahl als Chips - innerhalb einer Gruppe gilt ODER. */
export function Mehrfachauswahl({
  optionen,
  gewaehlt,
  onChange,
}: {
  optionen: Option[];
  gewaehlt: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="mehrfach">
      {optionen.map((option) => {
        const aktiv = gewaehlt.includes(option.id);
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={aktiv}
            onClick={() => onChange(aktiv ? gewaehlt.filter((id) => id !== option.id) : [...gewaehlt, option.id])}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
