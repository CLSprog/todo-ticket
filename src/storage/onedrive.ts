// OneDrive-Zugriff ueber Microsoft Graph.
//
// Baustein-Uebernahme aus P03 Packliste (src/onedrive.ts, Stand 2026-09-04),
// inhaltlich unveraendert bis auf Ordner und Dateinamen.
//
// Die Datei liegt sichtbar im OneDrive des Nutzers, nicht in einem versteckten
// App-Ordner, damit sie bei Bedarf manuell eingesehen oder gesichert werden kann.
// 07_Database ist der Ordner, in den ausschliesslich die App selbst schreibt.

import { getAccessToken } from "./auth";

const FOLDER = "_KI/ThinkTank/P08_ToDo-Liste/07_Database";
const FILE = "P08_ToDo-Ticket_Daten_AI.json";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export const DATA_FOLDER = FOLDER;
export const DATA_FILE = FILE;

function itemPath(file: string, folder: string = FOLDER): string {
  return `/me/drive/root:/${folder}/${file}`;
}

async function graphFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  return fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  });
}

export async function loadState(file: string = FILE, folder: string = FOLDER): Promise<unknown | null> {
  const response = await graphFetch(`${itemPath(file, folder)}:/content`);
  if (response.status === 404) return null; // erster Start: Datei existiert noch nicht
  if (!response.ok) throw new Error(`OneDrive-Ladefehler (${response.status})`);
  return response.json();
}

export async function saveState(state: unknown, file: string = FILE, folder: string = FOLDER): Promise<void> {
  const response = await graphFetch(`${itemPath(file, folder)}:/content`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  if (!response.ok) throw new Error(`OneDrive-Speicherfehler (${response.status})`);
}

export async function listFiles(folder: string = FOLDER): Promise<string[]> {
  const response = await graphFetch(`/me/drive/root:/${folder}:/children?$select=name&$top=200`);
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`OneDrive-Listungsfehler (${response.status})`);
  const body = (await response.json()) as { value?: { name?: string }[] };
  return (body.value ?? []).map((item) => item.name).filter((name): name is string => !!name);
}

/** Legt einen Ordner an, falls er noch nicht existiert (nur die letzte Ebene).
 *  Graph legt beim Schreiben einer Datei keine fehlenden Ordner mit an. */
export async function ensureFolder(folder: string = FOLDER): Promise<void> {
  const vorhanden = await graphFetch(`/me/drive/root:/${folder}`);
  if (vorhanden.ok) return;
  if (vorhanden.status !== 404) throw new Error(`OneDrive-Ordnerprüfung fehlgeschlagen (${vorhanden.status})`);

  const trenner = folder.lastIndexOf("/");
  const eltern = folder.slice(0, trenner);
  const name = folder.slice(trenner + 1);
  const angelegt = await graphFetch(`/me/drive/root:/${eltern}:/children`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
  });
  if (!angelegt.ok && angelegt.status !== 409) {
    throw new Error(`OneDrive-Ordner "${name}" konnte nicht angelegt werden (${angelegt.status})`);
  }
}

/** Sicherungskopie neben dem Hauptbestand (Kapitel 17: versionierter Snapshot). */
export async function saveBackup(state: unknown, stamp: string): Promise<void> {
  const ordner = `${FOLDER}/Sicherung`;
  await ensureFolder(ordner);
  await saveState(state, `P08_ToDo-Ticket_Daten_${stamp}_AI.json`, ordner);
}
