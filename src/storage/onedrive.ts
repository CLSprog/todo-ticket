// OneDrive-Speicherung -- Platzhalter, analog zu onedrive.ts aus P03_Packliste.
//
// Ziel-Verhalten (sobald der Microsoft-Login steht):
//  - Eine feste Datei im privaten OneDrive (z.B. "todo-ticket-daten.json")
//    haelt alle Eintraege als JSON-Array.
//  - load(): Datei lesen (per Microsoft-Graph-API, Endpunkt /me/drive/...),
//    bei erstem Start anlegen falls sie fehlt.
//  - save(): komplette, aktuelle Liste zurueckschreiben.
//  - Aenderungshistorie NIE in dieselbe Datei wie die Nutzdaten packen
//    (Lehre aus P03 -- siehe ThinkTank-Bibliothek).
//
// Bis Client-ID/Tenant-ID vorliegen (siehe auth.ts), bleibt dieses Modul
// unbenutzt und die App laeuft ausschliesslich mit dem lokalen
// Zwischenspeicher (localStore.ts).

import type { Eintrag } from "../types";
import { getAccessToken } from "./auth";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const DATEI_NAME = "todo-ticket-daten.json";

export async function ladeVonOneDrive(): Promise<Eintrag[]> {
  const token = await getAccessToken();
  const res = await fetch(
    `${GRAPH_BASE}/me/drive/special/approot:/${DATEI_NAME}:/content`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`OneDrive-Lesefehler: ${res.status}`);
  return (await res.json()) as Eintrag[];
}

export async function speichereAufOneDrive(eintraege: Eintrag[]): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(
    `${GRAPH_BASE}/me/drive/special/approot:/${DATEI_NAME}:/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(eintraege),
    }
  );
  if (!res.ok) throw new Error(`OneDrive-Schreibfehler: ${res.status}`);
}
