// =============================================================================
// B04-C08 Sperre gegen überlappende Durchgänge
// -----------------------------------------------------------------------------
// Fassung   : V01-00
// Stand     : 2026-09-07, 22:22
// Herkunft  : P03_Packliste V04-04, src/SchemaApp.tsx (speichertGeradeRef,
//             Wächter im 600-ms-Timeout, Freigabe im finally-Zweig)
// Sprache   : TypeScript, keine fremden Bibliotheken
//
// Unveraendert aus der ThinkTank-Bibliothek uebernommen (Bausteinpruefung
// Arbeitspunkt 3, 19.09.2026: "Erfuellt genau das, was P08 braucht, und
// benennt seine Grenze"). Quelle: _KI/ThinkTank/03_Bibliothek/04_Code/
// B04-C08_Speichersperre_V01-00_20260907-2222_AI.ts
//
// ZWECK
// Verhindert, dass ein langsamer Vorgang ein zweites Mal startet, während er
// noch läuft. In P03 überholten sich bei langsamer Leitung die Speichervorgänge
// und die App meldete fälschlich "ein anderes Gerät hat gespeichert".
//
// Zwei Bauformen für zwei Situationen:
//   nurEinerGleichzeitig(fn) - der zweite Aufruf wird STILL VERWORFEN.
//                              Für wiederholte Auslöser wie Auto-Speichern.
//   nacheinander(fn)         - der zweite Aufruf WARTET und läuft danach.
//                              Für Aufrufe, von denen keiner verloren gehen darf.
//
// VERTRAG (ändert sich nur mit VV)
//   nurEinerGleichzeitig<A, R>(fn) -> (...args: A) => Promise<R | undefined>
//   nacheinander<A, R>(fn)         -> (...args: A) => Promise<R>
//   erzeugeSperre()                -> { belegt, versuchen, freigeben }
//
// GRENZE: schützt nur innerhalb EINES Browser-Tabs bzw. einer Node-Instanz.
// Gegen zwei Geräte oder zwei Tabs hilft nur ein Abgleich (siehe B04-C04).
// =============================================================================

/** Einfache Sperre zum selbst Verwalten, wenn die Wrapper nicht passen. */
export function erzeugeSperre() {
  let belegt = false;
  return {
    /** Läuft gerade ein Durchgang? */
    belegt: () => belegt,
    /** true = Sperre erhalten, false = es läuft schon einer. */
    versuchen(): boolean {
      if (belegt) return false;
      belegt = true;
      return true;
    },
    freigeben(): void {
      belegt = false;
    },
  };
}

/**
 * Umhüllt eine Funktion so, dass sie nie zweimal gleichzeitig läuft.
 * Ein Aufruf während eines laufenden Durchgangs wird still verworfen und
 * liefert `undefined` - genau das Verhalten des Originals in P03.
 *
 * Die Freigabe erfolgt in `finally`, also auch dann, wenn der Durchgang
 * mit einem Fehler endet. Genau daran scheitert die handgeschriebene
 * Variante meistens.
 */
export function nurEinerGleichzeitig<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R | undefined> {
  const sperre = erzeugeSperre();
  return async (...args: A): Promise<R | undefined> => {
    if (!sperre.versuchen()) return undefined;
    try {
      return await fn(...args);
    } finally {
      sperre.freigeben();
    }
  };
}

/**
 * Umhüllt eine Funktion so, dass Aufrufe sich in eine Reihe stellen statt
 * verworfen zu werden. Jeder Aufruf läuft, aber immer nur einer zur Zeit.
 * Ein Fehler in einem Durchgang blockiert die Reihe nicht.
 */
export function nacheinander<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  let kette: Promise<unknown> = Promise.resolve();
  return (...args: A): Promise<R> => {
    const naechster = kette.then(
      () => fn(...args),
      () => fn(...args),
    );
    kette = naechster.catch(() => undefined);
    return naechster;
  };
}
