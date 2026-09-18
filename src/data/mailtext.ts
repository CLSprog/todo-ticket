// Kopierbarer Mail-/Nachrichtentext (Kapitel 13).
//
// Es duerfen ausschliesslich gespeicherte bzw. bestaetigte Angaben in den
// Text einfliessen. Ohne Solltermin entfaellt die Fristformulierung ganz -
// es wird keine Frist erfunden. Ohne klare Person bleibt die Anrede ein
// sichtbarer Platzhalter, damit nichts unbemerkt Falsches hinausgeht.

import { assignmentsOf, referencesOf, valueLabel } from "./db";
import { formatDate } from "./dates";
import type { Database, EntityType, WorkItem } from "./types";

export interface MailText {
  text: string;
  /** Hinweise darauf, was mangels Daten weggelassen wurde. */
  luecken: string[];
}

export function buildMailText(db: Database, type: EntityType, item: WorkItem, ticketTitle?: string): MailText {
  const luecken: string[] = [];
  const empfaenger = item.leadId ? valueLabel(db, item.leadId) : "";
  const anrede = empfaenger ? `Hallo ${empfaenger},` : "Hallo [Empfänger],";
  if (!empfaenger) luecken.push("Kein Lead gewählt – Anrede ist ein Platzhalter.");

  const zeilen: string[] = [anrede, ""];

  if (type === "Aufgabe" && ticketTitle) {
    zeilen.push(`Thema: ${ticketTitle}`);
  }
  zeilen.push(`Arbeitsauftrag: ${item.title}`);
  if (item.description.trim()) zeilen.push("", item.description.trim());

  if (item.dueDate) {
    zeilen.push("", `Ich brauche das Ergebnis bis ${formatDate(item.dueDate)}.`);
  } else {
    luecken.push("Kein Solltermin gesetzt – der Text enthält keine Frist.");
  }

  const rueckmeldung = assignmentsOf(db, item.id)
    .filter((a) => a.kind === "Rückmeldung an")
    .map((a) => valueLabel(db, a.valueId));
  if (rueckmeldung.length > 0) {
    zeilen.push("", `Bitte um Rückmeldung an ${rueckmeldung.join(", ")}.`);
  } else {
    zeilen.push("", "Bitte um kurze Rückmeldung, sobald das erledigt ist.");
  }

  const referenzen = referencesOf(db, item.id);
  if (referenzen.length > 0) {
    zeilen.push("", "Unterlagen:");
    for (const ref of referenzen) {
      zeilen.push(`- ${ref.label || ref.sourceType}${ref.uri ? ` (${ref.uri})` : ""}`);
    }
    luecken.push("Angehängte Dateien werden nicht mitgesendet – die App zeigt nur die Verweise.");
  }

  zeilen.push("", "Danke und beste Grüße", "Clemens");
  return { text: zeilen.join("\n"), luecken };
}
