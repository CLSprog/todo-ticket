// Ort des P08-Datenbestands in OneDrive.
//
// Seit Schritt 9 (Bausteine einbauen) laufen Lesen/Schreiben/Auflisten nicht
// mehr ueber eigene Funktionen dieser Datei, sondern ueber den Baustein
// B04-C01 (CloudSpeicher), erzeugt via erzeugeGraphSpeicher() in App.tsx.
// Hier bleiben nur die beiden ortsfesten Konstanten - Ordner und Dateiname -
// die App.tsx dem Baustein mitgibt.
//
// Die Datei liegt sichtbar im OneDrive des Nutzers, nicht in einem versteckten
// App-Ordner, damit sie bei Bedarf manuell eingesehen oder gesichert werden kann.

export const DATA_FOLDER = "_KI/ThinkTank/P08_ToDo-Liste/07_Database";
export const DATA_FILE = "P08_ToDo-Ticket_Daten_AI.json";
