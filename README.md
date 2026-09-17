# P08 ToDo-Ticket

Persönliche Vorgangs- und Aufgabenliste mit Delegation, nach Konzept **V01-04**
(20260917-0523), Regelwerte nach der Entscheidungsdatei **V01-01** (20260917-1407).

Diese Fassung **ersetzt** den bisherigen Inhalt des Repos `todo-ticket`
(flaches Datenmodell, Stand V01-01 vom 15.09.2026). Damit wird die Festlegung
aus V01-01, das alte Repo unangetastet stehen zu lassen, bewusst aufgehoben.
Der alte Stand bleibt in der Git-Historie und in den ZIPs unter `04_Code`
erhalten; er lief nur lokal im Browser und hatte keinen produktiven Bestand.

Die Fachbegriffe **Ticket** und **Aufgabe** bleiben im Datenmodell und in der
Oberfläche, weil Entscheidung D-01 sie ausdrücklich festlegt.

## Was drin ist (Startumfang nach Kapitel 24)

- **Schnellerfassung** – Speichern ist mit einem Titel möglich (D-03/T01).
  ID, Startdatum, Lead CLS und Priorität Mittel setzt die App selbst.
- **Ticket und Aufgaben** – ein Ticket ist das Anliegen, eine Aufgabe ein
  Arbeitsschritt darunter. Folgeaufgaben laufen unter derselben Ticket-ID mit
  eigener ID und Vorgängerbezug (D-12/A01).
- **Situationsfilter** – Projekt, Thema, Besprechungskreis, Arbeitsart, Person
  mit Rolle, Priorität, Status. Zwischen Gruppen UND, innerhalb einer
  Mehrfachauswahl ODER. Ein Ticket erscheint einmal, mit seinen Treffern.
- **Delegation** – fremder Lead erzeugt Delegationsbedarf, die App liefert
  einen kopierbaren Mailtext. Kopieren ist **keine** Übergabe; erst die
  ausdrückliche Bestätigung setzt Delegiert an/am und In Bearbeitung (D-09).
- **Assistenz** – „Als Nächstes“ reiht nach überfällig, Delegation, naher
  Solltermin, Alter und Priorität und nennt dabei immer den Grund.
- **Datenhaltung** – ein JSON-Hauptbestand, Excel als vollständiger Snapshot
  mit Roundtrip (T16), Konfliktbehandlung beim Abgleich zwischen Geräten.

Bewusst **nicht** enthalten: Komplex-Modul, automatischer Versand,
Dokumentenimport, Mehrbenutzerbetrieb (Kapitel 24, „Später“).

## Regeln

Alle Regeln stehen mit Festlegungsstand und Parametern in den Einstellungen und
im Datenbestand (Sammlung `rules`) – nichts davon ist im Code verdrahtet.

| Regel | Wert | Stand |
| --- | --- | --- |
| D02 interne Delegationsfrist | 1 Arbeitstag, durch früheren Solltermin begrenzt | aktiv |
| E01 Hinweis vor Solltermin | 3, 2, 1 und 0 Arbeitstage vorher | aktiv |
| E03 Alterung ohne Solltermin | 20 Arbeitstage | aktiv |
| A03 Abschluss bei offenen Aufgaben stoppen | – | aus (O-07 offen) |
| I01 Dokumentimport | – | aus (Später) |

Ohne hinterlegte Feiertagsliste zählen Montag bis Freitag als Arbeitstage.
Feiertagskalender, Uhrzeit des Hinweises und Kanal bei geschlossener App sind
laut Konzept offen (O-02, O-06) und werden hier nicht behauptet.

## Bausteine aus der ThinkTank-Bibliothek

Aus P03 Packliste übernommen statt neu gebaut:

| Datei | Herkunft | Änderung |
| --- | --- | --- |
| `src/storage/auth.ts` | P03 `src/auth.ts` | eigene Client-ID für P08 |
| `src/storage/onedrive.ts` | P03 `src/onedrive.ts` | eigener Ordner und Dateiname |
| `src/storage/syncStore.ts` | P03 `src/syncStore.ts` | eigener Präfix, generischer Typ |
| `src/storage/sync.ts` | P03 `src/sync.ts` | generisch über die Sammlungen statt fester Tabellen |
| `src/bausteine/B04-C07_Datei-Download.ts` | Bibliothek B04-C07 | unverändert |

Die Datenschicht liegt hinter `src/storage/repository.ts`. Formular, Filter und
Assistenz wissen nicht, wo die Daten liegen – eine spätere Mehrbenutzer- oder
Servervariante tritt an dieselbe Stelle.

## Entwicklung

```
npm install
npm run dev      # lokal
npm run test     # Abnahmetests Kapitel 22/23
npm run build    # Produktionsbau
```

## Vor dem ersten Deployment

`vite.config.ts` setzt `base: "/todo-ticket/"`. Daraus ergibt sich die
Redirect-URI `https://clsprog.github.io/todo-ticket` – genau die URI, die in der
Azure-App-Registrierung für P08 (Client-ID `5dae8075-…`) bereits hinterlegt ist.
In Azure ist deshalb **nichts** zu ändern. Wird der Repo-Name später doch
geändert, muss die neue URI dort ergänzt werden, sonst scheitert die Anmeldung
mit AADSTS50011. Lokale Entwicklung über `localhost` ist davon nicht betroffen.

Der Datenbestand landet in OneDrive unter
`_KI/ThinkTank/P08_ToDo-Liste/07_Database/P08_ToDo-Ticket_Daten_AI.json`.
Den Ordner legt die App beim ersten Speichern selbst an.
