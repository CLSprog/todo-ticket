// Lokaler Zwischenspeicher (Baustein-Kandidat, analog B04-C01 aus P03)
// Haelt den letzten bekannten Serverstand + eine Warteschlange nicht
// gesendeter Aenderungen, damit die App auch ganz ohne Internet
// sofort nutzbar ist (Lesen wie Schreiben).

import type { Eintrag } from "../types";

const LS_CACHE = "todoticket:cache:v1";
const LS_QUEUE = "todoticket:queue:v1";

export type QueueOp =
  | { op: "add"; tempId: string; data: Eintrag }
  | { op: "update"; targetId: string; patch: Partial<Eintrag> };

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Speicher voll o.ae. -- nicht kritisch, naechster Versuch greift wieder
  }
}

export function loadCache(): Eintrag[] {
  return loadJSON<Eintrag[]>(LS_CACHE, []);
}

export function saveCache(eintraege: Eintrag[]): void {
  saveJSON(LS_CACHE, eintraege);
}

export function loadQueue(): QueueOp[] {
  return loadJSON<QueueOp[]>(LS_QUEUE, []);
}

export function saveQueue(queue: QueueOp[]): void {
  saveJSON(LS_QUEUE, queue);
}
