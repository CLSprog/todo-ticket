import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Eintrag, NeuerEintrag, Filter } from "./types";
import {
  loadCache,
  saveCache,
  loadQueue,
  saveQueue,
  type QueueOp,
} from "./storage/localStore";
import { isSignedIn } from "./storage/auth";
// TODO: speichereAufOneDrive() aus onedrive.ts hier einbinden, sobald
// flushQueue() echte Schreibvorgaenge statt des Platzhalters ausfuehrt.
import { ladeVonOneDrive } from "./storage/onedrive";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function nextVorgangsNummer(alle: Eintrag[], projekt: string, jahr: string): string {
  const prefix = `${projekt}-${jahr}-`;
  const n = alle.filter((t) => t.vorgangsnummer?.startsWith(prefix)).length;
  return `${prefix}${String(n + 1).padStart(4, "0")}`;
}

export type ConnState = "connecting" | "online" | "offline";

export function useEintraege() {
  const [server, setServer] = useState<Eintrag[]>(() => loadCache());
  const [queue, setQueue] = useState<QueueOp[]>(() => loadQueue());
  const [filter, setFilter] = useState<Filter>("offen");
  const [conn, setConn] = useState<ConnState>("connecting");
  const tmpIdMap = useRef<Record<string, string>>({});
  const flushing = useRef(false);

  const view = useMemo<Eintrag[]>(() => {
    const byId: Record<string, Eintrag & { _pending?: boolean }> = {};
    server.forEach((e) => (byId[e.id] = { ...e }));
    queue.forEach((op) => {
      if (op.op === "add") {
        const resolved = tmpIdMap.current[op.tempId];
        if (!resolved || !byId[resolved]) {
          byId[op.tempId] = { ...op.data, _pending: true };
        }
      } else {
        const targetId = tmpIdMap.current[op.targetId] || op.targetId;
        if (byId[targetId]) {
          Object.assign(byId[targetId], op.patch, { _pending: true });
        }
      }
    });
    return Object.values(byId);
  }, [server, queue]);

  const flushQueue = useCallback(async () => {
    if (flushing.current || !navigator.onLine) return;
    const signedIn = await isSignedIn();
    if (!signedIn) return; // laeuft rein lokal, bis der Login steht
    flushing.current = true;
    try {
      while (queue.length > 0) {
        const op = queue[0];
        // Vereinfachtes Schreibmuster: komplette Liste zurueckschreiben.
        // TODO wenn OneDrive angebunden ist: pro Op anwenden statt Vollschreiben,
        // sobald ein Drei-Wege-Abgleich (Baustein-Kandidat) vorliegt.
        void op;
        break; // Platzhalter -- eigentliche Synchronisation folgt mit onedrive.ts
      }
      setConn("online");
    } catch {
      setConn("offline");
    } finally {
      flushing.current = false;
    }
  }, [queue]);

  useEffect(() => {
    saveCache(server);
  }, [server]);

  useEffect(() => {
    saveQueue(queue);
  }, [queue]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const signedIn = await isSignedIn();
      if (!signedIn) {
        setConn(navigator.onLine ? "offline" : "offline");
        return;
      }
      try {
        const daten = await ladeVonOneDrive();
        if (!cancelled) {
          setServer(daten);
          setConn("online");
        }
      } catch {
        if (!cancelled) setConn("offline");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onOnline = () => flushQueue();
    const onOffline = () => setConn("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [flushQueue]);

  const addEintrag = useCallback(
    (neu: NeuerEintrag) => {
      const now = new Date().toISOString();
      const jahr = neu.termin ? neu.termin.slice(0, 4) : String(new Date().getFullYear());
      const vorgangsnummer = nextVorgangsNummer(view, neu.projekt, jahr);
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const data: Eintrag = {
        ...neu,
        id: tempId,
        status: "offen",
        erledigtAm: null,
        vorgangsnummer,
        createdAt: now,
        updatedAt: now,
      };
      setQueue((q) => [...q, { op: "add", tempId, data }]);
      void flushQueue();
    },
    [view, flushQueue]
  );

  const updateEintrag = useCallback(
    (id: string, patch: Partial<Eintrag>) => {
      setQueue((q) => [...q, { op: "update", targetId: id, patch }]);
      void flushQueue();
    },
    [flushQueue]
  );

  const toggleDone = useCallback(
    (id: string) => {
      const e = view.find((x) => x.id === id);
      if (!e) return;
      const neuerStatus = e.status === "erledigt" ? "offen" : "erledigt";
      updateEintrag(id, {
        status: neuerStatus,
        erledigtAm: neuerStatus === "erledigt" ? todayISO() : null,
      });
    },
    [view, updateEintrag]
  );

  const cycleStatus = useCallback(
    (id: string, next: Eintrag["status"]) => {
      updateEintrag(id, {
        status: next,
        erledigtAm: next === "erledigt" ? todayISO() : null,
      });
    },
    [updateEintrag]
  );

  return {
    view,
    filter,
    setFilter,
    conn,
    addEintrag,
    toggleDone,
    cycleStatus,
    pendingCount: queue.length,
  };
}
