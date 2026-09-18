// Datums- und Arbeitstagsrechnung.
//
// Entscheidung V01-01 (20260917-1407): Fristen rechnen in ARBEITSTAGEN.
// Ein Feiertagskalender ist im Konzept ausdruecklich noch offen (O-02) -
// deshalb kennt dieses Modul nur Wochenenden und eine leere, in den
// Einstellungen befuellbare Feiertagsliste. Solange diese leer ist, zaehlt
// jeder Werktag Montag bis Freitag als Arbeitstag. Es wird bewusst kein
// Kalender erfunden.

export type ISODate = string;

const MS_PER_DAY = 86_400_000;

/** Heute als YYYY-MM-DD in lokaler Zeit (Konzept: Europe/Vienna). */
export function today(): ISODate {
  return toISODate(new Date());
}

export function toISODate(value: Date): ISODate {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function fromISODate(value: ISODate): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function nowTimestamp(): string {
  return new Date().toISOString();
}

/** Ganze Kalendertage zwischen zwei Datumsangaben (b - a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((fromISODate(b).getTime() - fromISODate(a).getTime()) / MS_PER_DAY);
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isWorkingDay(date: ISODate, holidays: ISODate[] = []): boolean {
  return !isWeekend(fromISODate(date)) && !holidays.includes(date);
}

/** Addiert n Arbeitstage. n = 0 rueckt auf den naechsten Arbeitstag vor,
 *  wenn das Ausgangsdatum selbst keiner ist. */
export function addWorkingDays(start: ISODate, n: number, holidays: ISODate[] = []): ISODate {
  const cursor = fromISODate(start);
  let remaining = n;
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + 1);
    if (isWorkingDay(toISODate(cursor), holidays)) remaining -= 1;
  }
  while (!isWorkingDay(toISODate(cursor), holidays)) {
    cursor.setDate(cursor.getDate() + 1);
  }
  return toISODate(cursor);
}

export function addCalendarDays(start: ISODate, n: number): ISODate {
  const cursor = fromISODate(start);
  cursor.setDate(cursor.getDate() + n);
  return toISODate(cursor);
}

/** Arbeitstage zwischen zwei Datumsangaben; der Starttag zaehlt nicht mit,
 *  der Zieltag schon. Negativ, wenn das Ziel in der Vergangenheit liegt. */
export function workingDaysBetween(from: ISODate, to: ISODate, holidays: ISODate[] = []): number {
  const step = daysBetween(from, to) >= 0 ? 1 : -1;
  let count = 0;
  let cursor = from;
  while (cursor !== to) {
    cursor = addCalendarDays(cursor, step);
    if (isWorkingDay(cursor, holidays)) count += step;
  }
  return count;
}

export function formatDate(value: ISODate | null): string {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  return `${d}.${m}.${y}`;
}

export function formatTimestamp(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return `${formatDate(toISODate(date))} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}
