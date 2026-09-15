# ToDo-Liste_Ticket (P08)

Büro-Ticketsystem als eigenständige Web-App (React + Vite), unabhängig von
jeder KI-Infrastruktur. Läuft im Browser auf jedem Gerät, funktioniert
offline (lokaler Zwischenspeicher + Warteschlange) und synchronisiert
über OneDrive, sobald der Microsoft-Login eingerichtet ist.

## Stand

- Datenmodell, Oberfläche und Offline-Fähigkeit (lokal je Gerät) sind fertig.
- Microsoft-Login/OneDrive-Sync ist als Platzhalter angelegt
  (`src/storage/auth.ts`, `src/storage/onedrive.ts`) — die App läuft bis
  dahin komplett lokal in `localStorage`, ohne Geräte-übergreifenden Sync.

## Einrichtung: Microsoft-Login aktivieren

1. Im [Azure-Portal](https://portal.azure.com) unter "App-Registrierungen"
   eine neue App anlegen (z.B. Name "P08 ToDo-Liste_Ticket"), Kontotyp je
   nach Microsoft-Konto (persönliches Konto: "Nur persönliche Microsoft-Konten").
2. Redirect-URI: `https://clsprog.github.io/todo-ticket`
3. Unter "API-Berechtigungen": `Files.ReadWrite`, `offline_access`, `User.Read`
   hinzufügen.
4. Client-ID und Tenant-ID in `src/storage/auth.ts` (`AZURE_CONFIG`) eintragen.
5. `npm install @azure/msal-browser` und die MSAL-Anbindung in `auth.ts` /
   `onedrive.ts` fertig verdrahten (aktuell Platzhalter mit TODO-Markierungen).

## Entwicklung

```
npm install
npm run dev
```

## Veröffentlichung

Push nach `main` löst automatisch den Build + Deploy nach GitHub Pages aus
(`.github/workflows/deploy.yml`). Einmalig in den Repo-Einstellungen unter
"Pages" die Quelle auf "GitHub Actions" stellen.

## Bausteine

`src/storage/localStore.ts` (Offline-Zwischenspeicher + Warteschlange) folgt
demselben Muster wie die ThinkTank-Bibliothek (B04-C0x aus P03_Packliste).
Sobald diese Bausteine als eigenständige Module vorliegen, sollten sie hier
eingesetzt werden statt der aktuellen Eigenimplementierung.
