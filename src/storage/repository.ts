// Die Datenschicht hinter einer austauschbaren Schnittstelle.
//
// Entscheidung V01-01 (20260917-1407): Formular, Filter und Assistenzlogik
// duerfen nicht wissen, wo die Daten liegen. "Ein Benutzer, lokal/OneDrive"
// ist heute nur eine Implementierung dieser Schnittstelle, kein fest
// einprogrammiertes Merkmal - eine spaetere Mehrbenutzer- oder
// Server-Variante tritt an dieselbe Stelle.

import type { Database } from "../data/types";
import { diffAndMerge, type FieldConflict } from "./sync";
import * as onedrive from "./onedrive";
import { getAccount, initMsal, login, logout } from "./auth";
import { istVerbindungsfehler, readBaseline, writeBaseline } from "./syncStore";
import { DATA_FILE } from "./onedrive";

export type SaveOutcome =
  | { status: "gespeichert"; db: Database }
  | { status: "konflikt"; merged: Database; conflicts: FieldConflict[] }
  | { status: "offline" };

export interface Repository {
  readonly id: "local" | "onedrive";
  readonly label: string;
  /** Braucht diese Ablage eine Anmeldung, und besteht sie gerade? */
  needsSignIn(): boolean;
  isSignedIn(): boolean;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  init(): Promise<void>;
  load(): Promise<Database | null>;
  /** Speichert und fuehrt dabei, wo noetig, mit dem entfernten Stand zusammen. */
  save(db: Database): Promise<SaveOutcome>;
  /** Uebernimmt einen vom Benutzer aufgeloesten Stand ohne erneuten Abgleich. */
  force(db: Database): Promise<void>;
}

const LOCAL_KEY = "p08_database";

export class LocalRepository implements Repository {
  readonly id = "local" as const;
  readonly label = "Nur auf diesem Gerät";

  needsSignIn() {
    return false;
  }
  isSignedIn() {
    return true;
  }
  async signIn() {}
  async signOut() {}
  async init() {}

  async load(): Promise<Database | null> {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      const stand = raw ? (JSON.parse(raw) as Database) : null;
      if (stand) writeBaseline(DATA_FILE, stand);
      return stand;
    } catch {
      return null;
    }
  }

  async save(db: Database): Promise<SaveOutcome> {
    await this.force(db);
    return { status: "gespeichert", db };
  }

  async force(db: Database): Promise<void> {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(db));
      // Auch lokal eine Ausgangsfassung fuehren: ohne sie kann ein spaeterer
      // Abgleich ungesicherte Aenderungen nicht zusammenfuehren.
      writeBaseline(DATA_FILE, db);
    } catch (error) {
      throw new Error(`Lokaler Speicher nicht verfügbar: ${String(error)}`);
    }
  }
}

export class OneDriveRepository implements Repository {
  readonly id = "onedrive" as const;
  readonly label = "OneDrive";
  private readonly file = onedrive.DATA_FILE;

  needsSignIn() {
    return true;
  }
  isSignedIn() {
    return getAccount() !== null;
  }
  async init() {
    await initMsal();
  }
  async signIn() {
    await initMsal();
    await login();
  }
  async signOut() {
    await logout();
  }

  async load(): Promise<Database | null> {
    const remote = (await onedrive.loadState()) as Database | null;
    if (remote) writeBaseline(this.file, remote);
    return remote;
  }

  /** Vor dem Schreiben den zuletzt gelesenen Stand pruefen (Kapitel 16).
   *  Bei abweichender Fassung wird zusammengefuehrt, soweit konfliktfrei;
   *  konkurrierende Feldaenderungen werden vorgelegt, nicht ueberschrieben. */
  async save(db: Database): Promise<SaveOutcome> {
    try {
      const remote = (await onedrive.loadState()) as Database | null;
      if (!remote) {
        await onedrive.ensureFolder();
        await onedrive.saveState(db);
        writeBaseline(this.file, db);
        return { status: "gespeichert", db };
      }

      const baseline = readBaseline(this.file) ?? remote;
      const { merged, conflicts } = diffAndMerge(baseline, db, remote);
      if (conflicts.length > 0) return { status: "konflikt", merged, conflicts };

      await onedrive.saveState(merged);
      writeBaseline(this.file, merged);
      return { status: "gespeichert", db: merged };
    } catch (error) {
      if (istVerbindungsfehler(error)) return { status: "offline" };
      throw error;
    }
  }

  async force(db: Database): Promise<void> {
    await onedrive.ensureFolder();
    await onedrive.saveState(db);
    writeBaseline(this.file, db);
  }
}

export function makeRepository(id: string): Repository {
  return id === "onedrive" ? new OneDriveRepository() : new LocalRepository();
}
